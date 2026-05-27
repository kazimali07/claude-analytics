"""SQLite connection helpers and schema bootstrap."""
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS messages (
    request_id        TEXT PRIMARY KEY,
    session_id        TEXT NOT NULL,
    project_path      TEXT NOT NULL,
    ts_utc            TEXT NOT NULL,
    model             TEXT NOT NULL,
    input_tokens      INTEGER NOT NULL,
    output_tokens     INTEGER NOT NULL,
    cache_read        INTEGER NOT NULL,
    cache_create_5m   INTEGER NOT NULL,
    cache_create_1h   INTEGER NOT NULL,
    service_tier      TEXT,
    source_file       TEXT NOT NULL,
    source_offset     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_messages_ts       ON messages(ts_utc);
CREATE INDEX IF NOT EXISTS ix_messages_session  ON messages(session_id);
CREATE INDEX IF NOT EXISTS ix_messages_model_ts ON messages(model, ts_utc);

CREATE TABLE IF NOT EXISTS ingest_cursor (
    source_file  TEXT PRIMARY KEY,
    last_offset  INTEGER NOT NULL,
    last_ts_utc  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_windows (
    window_start_utc TEXT PRIMARY KEY,
    window_end_utc   TEXT NOT NULL
);
"""


def open_db(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
