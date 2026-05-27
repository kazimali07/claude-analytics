import json
from pathlib import Path

import pytest

from claude_usage.config import Config
from claude_usage.db import ensure_schema, open_db
from claude_usage.mcp_server import build_server
from claude_usage.state import StateService


def _make_server(tmp_path: Path):
    conn = open_db(tmp_path / "u.db")
    ensure_schema(conn)
    svc = StateService(conn, Config())
    return build_server(svc)


@pytest.mark.asyncio
async def test_three_tools_are_registered(tmp_path: Path):
    server = _make_server(tmp_path)
    tools = await server.list_tools()
    names = {t.name for t in tools}
    assert {"get_state", "forecast", "recent_sessions"} <= names


@pytest.mark.asyncio
async def test_get_state_returns_valid_payload(tmp_path: Path):
    server = _make_server(tmp_path)
    result = await server.call_tool("get_state", {})
    # FastMCP returns (content_list, structured_content) in newer versions or a list in older.
    content = result[0] if isinstance(result, tuple) else result
    payload_text = content[0].text
    payload = json.loads(payload_text)
    assert "window_5h" in payload
    assert "weekly" in payload


@pytest.mark.asyncio
async def test_forecast_returns_verdict(tmp_path: Path):
    server = _make_server(tmp_path)
    result = await server.call_tool("forecast", {"planned_msgs": 5, "model": "opus"})
    content = result[0] if isinstance(result, tuple) else result
    payload_text = content[0].text
    payload = json.loads(payload_text)
    assert payload["verdict"] in ("go", "caution", "stop")
