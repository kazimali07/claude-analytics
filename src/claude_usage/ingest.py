"""Filesystem watcher + per-file JSONL → SQLite ingest."""
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from claude_usage.extract import MessageRow, extract_usage

log = logging.getLogger("claude_usage.ingest")

INSERT_SQL = """
INSERT OR IGNORE INTO messages (
    request_id, session_id, project_path, ts_utc, model,
    input_tokens, output_tokens, cache_read, cache_create_5m, cache_create_1h,
    service_tier, source_file, source_offset
) VALUES (?,?,?,?,?, ?,?,?,?,?, ?,?,?)
"""


def _row_tuple(r: MessageRow) -> tuple:
    return (
        r.request_id, r.session_id, r.project_path, r.ts_utc, r.model,
        r.input_tokens, r.output_tokens, r.cache_read, r.cache_create_5m, r.cache_create_1h,
        r.service_tier, r.source_file, r.source_offset,
    )


def _get_cursor(conn: sqlite3.Connection, source_file: str) -> int:
    row = conn.execute(
        "SELECT last_offset FROM ingest_cursor WHERE source_file = ?", (source_file,)
    ).fetchone()
    return row["last_offset"] if row else 0


def _save_cursor(conn: sqlite3.Connection, source_file: str, last_offset: int, last_ts_utc: str) -> None:
    conn.execute(
        """
        INSERT INTO ingest_cursor (source_file, last_offset, last_ts_utc)
        VALUES (?,?,?)
        ON CONFLICT(source_file) DO UPDATE SET
            last_offset = excluded.last_offset,
            last_ts_utc = excluded.last_ts_utc
        """,
        (source_file, last_offset, last_ts_utc),
    )


def process_file(conn: sqlite3.Connection, path: Path) -> int:
    """Process new bytes in `path`, return number of rows inserted (post-dedup)."""
    src = str(path)
    last_offset = _get_cursor(conn, src)
    if not path.exists():
        return 0

    size = path.stat().st_size
    if size < last_offset:                    # truncation
        last_offset = 0

    inserted = 0
    last_ts: Optional[str] = None

    conn.execute("BEGIN")
    try:
        with path.open("rb") as f:
            f.seek(last_offset)
            while True:
                line_start = f.tell()
                raw = f.readline()
                if not raw:
                    break
                if not raw.endswith(b"\n"):
                    # Partial line: don't advance past it; retry next call.
                    break
                row = extract_usage(
                    raw.decode("utf-8", errors="replace").rstrip("\n"),
                    source_file=src,
                    source_offset=line_start,
                )
                if row is not None:
                    cur = conn.execute(INSERT_SQL, _row_tuple(row))
                    inserted += cur.rowcount
                    last_ts = row.ts_utc
                last_offset = f.tell()
        _save_cursor(conn, src, last_offset, last_ts or "")
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return inserted


class _JsonlHandler(FileSystemEventHandler):
    def __init__(self, dirty: set[Path], lock: threading.Lock):
        self.dirty = dirty
        self.lock = lock

    def _mark(self, path: str) -> None:
        if path.endswith(".jsonl"):
            with self.lock:
                self.dirty.add(Path(path))

    def on_created(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._mark(event.src_path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if not event.is_directory:
            self._mark(event.src_path)


def run_daemon(conn: sqlite3.Connection, projects_dir: Path, debounce: float = 0.2) -> None:
    """Watch projects_dir for .jsonl changes, flush per debounce window. Runs forever."""
    log.info("daemon starting; watching %s", projects_dir)

    for jsonl in projects_dir.rglob("*.jsonl"):
        n = process_file(conn, jsonl)
        if n:
            log.info("backfill +%d msgs from %s", n, jsonl.name)

    dirty: set[Path] = set()
    lock = threading.Lock()
    handler = _JsonlHandler(dirty, lock)
    observer = Observer()
    observer.schedule(handler, str(projects_dir), recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(debounce)
            with lock:
                batch = list(dirty)
                dirty.clear()
            for path in batch:
                try:
                    n = process_file(conn, path)
                    if n:
                        log.info("+%d msgs from %s", n, path.name)
                except Exception as e:
                    log.exception("process_file failed for %s: %s", path, e)
    finally:
        observer.stop()
        observer.join()
