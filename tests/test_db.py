import sqlite3
from pathlib import Path
from claude_usage.db import open_db, ensure_schema


def test_open_db_creates_wal_database(tmp_path: Path):
    db_path = tmp_path / "usage.db"
    conn = open_db(db_path)
    ensure_schema(conn)

    journal = conn.execute("PRAGMA journal_mode").fetchone()[0]
    assert journal == "wal"

    tables = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert {"messages", "ingest_cursor", "rate_windows"} <= tables
    conn.close()


def test_ensure_schema_is_idempotent(tmp_path: Path):
    db_path = tmp_path / "usage.db"
    conn = open_db(db_path)
    ensure_schema(conn)
    ensure_schema(conn)   # second call must not error
    conn.close()
