from datetime import datetime, timezone
from pathlib import Path

from claude_usage.config import Config
from claude_usage.db import ensure_schema, open_db
from claude_usage.state import StateService


def _insert(conn, ts: str, model: str, request_id: str):
    conn.execute(
        """INSERT INTO messages (request_id, session_id, project_path, ts_utc, model,
           input_tokens, output_tokens, cache_read, cache_create_5m, cache_create_1h,
           service_tier, source_file, source_offset)
           VALUES (?, 's', '/p', ?, ?, 1, 1, 0, 0, 0, 'standard', '/x', 0)""",
        (request_id, ts, model),
    )


def test_state_snapshot_includes_active_window(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    _insert(conn, "2026-05-27T16:50:00Z", "claude-opus-4-7", "r1")
    _insert(conn, "2026-05-27T16:55:00Z", "claude-opus-4-7", "r2")
    svc = StateService(conn, Config())
    now = datetime(2026, 5, 27, 17, 0, tzinfo=timezone.utc)
    snap = svc.get_state(now=now)
    assert snap["window_5h"]["active"] is True
    assert snap["window_5h"]["msgs_used"] == 2
    assert snap["weekly"]["opus_hours_used"] == 2 / 60


def test_forecast_returns_go_for_low_usage(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    _insert(conn, "2026-05-27T16:50:00Z", "claude-opus-4-7", "r1")
    svc = StateService(conn, Config())
    now = datetime(2026, 5, 27, 17, 0, tzinfo=timezone.utc)
    v = svc.forecast(planned_msgs=5, model="opus", now=now)
    assert v["verdict"] == "go"


def test_recent_sessions_returns_summary_per_session(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    _insert(conn, "2026-05-27T16:00:00Z", "claude-opus-4-7", "r1")
    _insert(conn, "2026-05-27T16:01:00Z", "claude-opus-4-7", "r2")
    svc = StateService(conn, Config())
    rows = svc.recent_sessions(limit=5)
    assert len(rows) == 1
    assert rows[0]["session_id"] == "s"
    assert rows[0]["input_tokens"] == 2
