"""Textual sessions-table app for tmux pane 1."""
from pathlib import Path

from textual.app import App, ComposeResult
from textual.widgets import DataTable

from claude_usage.config import Config
from claude_usage.db import ensure_schema, open_db
from claude_usage.state import StateService


class SessionsApp(App):
    REFRESH_SECONDS = 5.0

    def __init__(self, db_path: Path) -> None:
        super().__init__()
        conn = open_db(db_path)
        ensure_schema(conn)
        self.svc = StateService(conn, Config())

    def compose(self) -> ComposeResult:
        yield DataTable(id="t")

    def on_mount(self) -> None:
        table: DataTable = self.query_one("#t", DataTable)
        table.add_columns("ended", "project", "session", "tokens_in", "tokens_out", "cache_read")
        self._refresh()
        self.set_interval(self.REFRESH_SECONDS, self._refresh)

    def _refresh(self) -> None:
        table: DataTable = self.query_one("#t", DataTable)
        table.clear()
        for s in self.svc.recent_sessions(limit=20):
            table.add_row(
                (s["ended_at"] or "")[11:19],
                Path(s["project_path"] or "").name or "-",
                (s["session_id"] or "")[:8],
                f"{s['input_tokens']:,}",
                f"{s['output_tokens']:,}",
                f"{s['cache_read']:,}",
            )
