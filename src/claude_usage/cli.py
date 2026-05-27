"""Typer entrypoint for the `claude-usage` command."""
import logging
from pathlib import Path

import typer

from claude_usage.config import DEFAULT_PATH, load_config
from claude_usage.db import ensure_schema, open_db

app = typer.Typer(help="Local Claude Code usage tracker.")
tui_app = typer.Typer(help="Render TUI views.")
app.add_typer(tui_app, name="tui")

DB_PATH = Path.home() / ".claude-usage" / "usage.db"
PROJECTS_DIR = Path.home() / ".claude" / "projects"


def _setup_logging() -> None:
    logging.basicConfig(
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        level=logging.INFO,
    )


@app.command()
def daemon() -> None:
    """Watch ~/.claude/projects and ingest into ~/.claude-usage/usage.db."""
    from claude_usage.ingest import run_daemon
    _setup_logging()
    conn = open_db(DB_PATH)
    ensure_schema(conn)
    run_daemon(conn, PROJECTS_DIR)


@app.command()
def mcp() -> None:
    """Start the MCP server on the configured port."""
    from claude_usage.mcp_server import serve
    _setup_logging()
    cfg = load_config(DEFAULT_PATH)
    serve(DB_PATH, cfg)


@tui_app.command()
def gauge() -> None:
    """Render the fuel gauge."""
    from claude_usage.tui.gauge import GaugeApp
    GaugeApp(DB_PATH, load_config(DEFAULT_PATH)).run()


@tui_app.command()
def sessions() -> None:
    """Render the recent sessions table."""
    from claude_usage.tui.sessions import SessionsApp
    SessionsApp(DB_PATH).run()


if __name__ == "__main__":
    app()
