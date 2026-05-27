"""Textual fuel-gauge app for tmux pane 0."""
from datetime import datetime, timezone
from pathlib import Path

from textual.app import App, ComposeResult
from textual.containers import Vertical
from textual.widgets import ProgressBar, Static

from claude_usage.config import Config
from claude_usage.db import ensure_schema, open_db
from claude_usage.state import StateService


class GaugeApp(App):
    CSS = """
    Screen { background: #0b0f14; }
    #title { padding: 1 2; color: #a3e3a8; }
    .row   { padding: 0 2; height: 4; }
    .label { color: #7aa2c7; }
    """

    REFRESH_SECONDS = 2.0

    def __init__(self, db_path: Path, cfg: Config) -> None:
        super().__init__()
        conn = open_db(db_path)
        ensure_schema(conn)
        self.svc = StateService(conn, cfg)

    def compose(self) -> ComposeResult:
        yield Static("CLAUDE USAGE — Max 5x", id="title")
        with Vertical(classes="row", id="row-5h"):
            yield Static("5-hour window", classes="label")
            yield ProgressBar(id="bar-5h", show_eta=False)
            yield Static("", id="text-5h")
        with Vertical(classes="row", id="row-opus"):
            yield Static("Weekly Opus", classes="label")
            yield ProgressBar(id="bar-opus", show_eta=False)
            yield Static("", id="text-opus")
        with Vertical(classes="row", id="row-sonnet"):
            yield Static("Weekly Sonnet", classes="label")
            yield ProgressBar(id="bar-sonnet", show_eta=False)
            yield Static("", id="text-sonnet")
        yield Static("", id="footer")

    def on_mount(self) -> None:
        self._refresh()
        self.set_interval(self.REFRESH_SECONDS, self._refresh)

    def _refresh(self) -> None:
        snap = self.svc.get_state(now=datetime.now(timezone.utc))
        self._set_bar(
            "bar-5h", "text-5h", "row-5h",
            pct=snap["window_5h"].get("pct_of_observed_max", 0.0),
            label=self._5h_text(snap),
        )
        w = snap["weekly"]
        self._set_bar(
            "bar-opus", "text-opus", "row-opus",
            pct=w["opus_pct"],
            label=f"{w['opus_hours_used']:.1f}h / {w['opus_observed_max']:.1f}h",
        )
        self._set_bar(
            "bar-sonnet", "text-sonnet", "row-sonnet",
            pct=w["sonnet_pct"],
            label=f"{w['sonnet_hours_used']:.1f}h / {w['sonnet_observed_max']:.1f}h",
        )

    def _5h_text(self, snap: dict) -> str:
        w = snap["window_5h"]
        if not w["active"]:
            return "no active window"
        return f"{w['msgs_used']} / {w['msgs_observed_max']} msgs  ·  resets {w['ends_at']}"

    def _set_bar(self, bar_id: str, text_id: str, row_id: str, *, pct: float, label: str) -> None:
        bar = self.query_one(f"#{bar_id}", ProgressBar)
        bar.update(total=100, progress=int(pct * 100))
        self.query_one(f"#{text_id}", Static).update(label)
        row = self.query_one(f"#{row_id}")
        row.set_classes(f"row {'red' if pct >= 0.8 else 'yellow' if pct >= 0.6 else 'green'}")
