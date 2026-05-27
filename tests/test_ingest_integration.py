from pathlib import Path

from claude_usage.db import ensure_schema, open_db
from claude_usage.ingest import process_file


def test_process_file_inserts_only_assistant_messages_with_usage(tmp_path: Path, fixtures_dir: Path):
    src = fixtures_dir / "sample_session.jsonl"
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)

    rows = db.execute(
        "SELECT request_id, model, output_tokens FROM messages ORDER BY ts_utc"
    ).fetchall()
    assert [r["request_id"] for r in rows] == ["req_A", "req_B"]
    assert [r["model"] for r in rows] == ["claude-opus-4-7", "claude-sonnet-4-6"]


def test_process_file_is_idempotent(tmp_path: Path, fixtures_dir: Path):
    src = fixtures_dir / "sample_session.jsonl"
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)
    process_file(db, src)
    n = db.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    assert n == 2


def test_process_file_resumes_from_cursor(tmp_path: Path):
    src = tmp_path / "growing.jsonl"
    src.write_text(
        '{"type":"assistant","message":{"model":"claude-opus-4-7","usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"r1","sessionId":"s","timestamp":"2026-05-12T08:17:05.000Z","cwd":"/p"}\n'
    )
    db = open_db(tmp_path / "usage.db")
    ensure_schema(db)
    process_file(db, src)
    assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 1

    with src.open("a") as f:
        f.write(
            '{"type":"assistant","message":{"model":"claude-opus-4-7","usage":{"input_tokens":1,"output_tokens":2,"cache_read_input_tokens":0,"cache_creation_input_tokens":0,"service_tier":"standard","cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":0}}},"requestId":"r2","sessionId":"s","timestamp":"2026-05-12T08:17:10.000Z","cwd":"/p"}\n'
        )
    process_file(db, src)
    assert db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 2
