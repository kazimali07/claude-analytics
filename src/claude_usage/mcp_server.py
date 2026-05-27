"""MCP server exposing usage state over streamable HTTP."""
import logging
from pathlib import Path
from typing import Literal

from mcp.server.fastmcp import FastMCP

from claude_usage.config import Config
from claude_usage.db import ensure_schema, open_db
from claude_usage.state import StateService

log = logging.getLogger("claude_usage.mcp")


def build_server(svc: StateService, *, host: str = "127.0.0.1", port: int = 7878) -> FastMCP:
    server = FastMCP("claude-usage", host=host, port=port)

    @server.tool(description="Current usage snapshot against 5h and weekly limits.")
    def get_state() -> dict:
        return svc.get_state()

    @server.tool(
        description=(
            "Will `planned_msgs` of `model` fit in current 5h window AND weekly cap? "
            "Returns verdict: 'go' | 'caution' | 'stop'."
        )
    )
    def forecast(planned_msgs: int, model: Literal["opus", "sonnet"] = "opus") -> dict:
        return dict(svc.forecast(planned_msgs=planned_msgs, model=model))

    @server.tool(description="Last N sessions with model mix and tokens (default 10, max 100).")
    def recent_sessions(limit: int = 10) -> list[dict]:
        limit = max(1, min(100, limit))
        return svc.recent_sessions(limit=limit)

    return server


def serve(db_path: Path, cfg: Config) -> None:
    conn = open_db(db_path)
    ensure_schema(conn)
    svc = StateService(conn, cfg)
    server = build_server(svc, host=cfg.mcp_host, port=cfg.mcp_port)
    log.info("MCP server listening on http://%s:%d/mcp", cfg.mcp_host, cfg.mcp_port)
    server.run(transport="streamable-http")
