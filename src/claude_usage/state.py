"""Assembles read-side StateSnapshot for MCP and TUI consumers."""
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from claude_usage.config import Config
from claude_usage.forecast import Verdict
from claude_usage.forecast import forecast as _forecast
from claude_usage.windows import (
    current_5h_window,
    model_family,
    msgs_in_window,
    weekly_hours_used,
)


@dataclass
class StateService:
    conn: sqlite3.Connection
    cfg:  Config

    def _all_ts(self) -> list[str]:
        return [r[0] for r in self.conn.execute("SELECT ts_utc FROM messages ORDER BY ts_utc")]

    def _ts_with_model(self) -> list[tuple[str, str]]:
        return [(r[0], r[1]) for r in self.conn.execute("SELECT ts_utc, model FROM messages")]

    # Floor for observed_max while history is sparse — the upper end of
    # Anthropic's published Max-5x range. Prevents a one-message DB from
    # reporting 100% usage. Real observed maxes will exceed this once the
    # user actually runs heavy sessions.
    _MSGS_FLOOR = 200

    def _observed_max_msgs(self) -> int:
        if self.cfg.msgs_per_5h_window is not None:
            return self.cfg.msgs_per_5h_window
        ts = self._all_ts()
        if not ts:
            return self._MSGS_FLOOR
        parsed = sorted(datetime.fromisoformat(t.replace("Z", "+00:00")) for t in ts)
        best = 1
        left = 0
        for right in range(len(parsed)):
            while parsed[right] - parsed[left] > timedelta(hours=5):
                left += 1
            best = max(best, right - left + 1)
        return max(best, self._MSGS_FLOOR)

    def _observed_max_weekly(self, family: str) -> float:
        override = self.cfg.weekly_opus_hours if family == "opus" else self.cfg.weekly_sonnet_hours
        if override is not None:
            return override
        return 35.0 if family == "opus" else 280.0

    def _avg_minutes_per_msg(self, family: str) -> float:
        rows = list(self.conn.execute(
            "SELECT ts_utc, model FROM messages ORDER BY ts_utc DESC LIMIT 500"
        ))
        same = [r for r in rows if model_family(r["model"]) == family]
        if len(same) < 2:
            return 1.0
        first = datetime.fromisoformat(same[-1]["ts_utc"].replace("Z", "+00:00"))
        last  = datetime.fromisoformat(same[0]["ts_utc"].replace("Z", "+00:00"))
        span_minutes = (last - first).total_seconds() / 60.0
        return max(0.1, span_minutes / len(same))

    def get_state(self, *, now: Optional[datetime] = None) -> dict:
        now = now or datetime.now(timezone.utc)
        ts = self._all_ts()
        window = current_5h_window(ts, now=now)
        observed_cap = self._observed_max_msgs()
        window_payload: dict = {"active": False, "msgs_used": 0, "msgs_observed_max": observed_cap}
        if window is not None:
            start, end = window
            msgs_used = msgs_in_window(ts, start=start, end=end)
            window_payload = {
                "active": True,
                "started_at": start.isoformat().replace("+00:00", "Z"),
                "ends_at":    end.isoformat().replace("+00:00", "Z"),
                "msgs_used":  msgs_used,
                "msgs_observed_max": observed_cap,
                "pct_of_observed_max": msgs_used / observed_cap if observed_cap else 0.0,
            }

        ts_model = self._ts_with_model()
        opus_h   = weekly_hours_used(ts_model, family="opus", now=now)
        sonnet_h = weekly_hours_used(ts_model, family="sonnet", now=now)
        opus_cap   = self._observed_max_weekly("opus")
        sonnet_cap = self._observed_max_weekly("sonnet")

        return {
            "window_5h": window_payload,
            "weekly": {
                "opus_hours_used":   opus_h,
                "opus_observed_max": opus_cap,
                "opus_pct":          opus_h / opus_cap if opus_cap else 0.0,
                "sonnet_hours_used":   sonnet_h,
                "sonnet_observed_max": sonnet_cap,
                "sonnet_pct":          sonnet_h / sonnet_cap if sonnet_cap else 0.0,
            },
            "as_of": now.isoformat().replace("+00:00", "Z"),
        }

    def forecast(self, *, planned_msgs: int, model: str, now: Optional[datetime] = None) -> Verdict:
        snap = self.get_state(now=now)
        family = "opus" if "opus" in model.lower() else "sonnet"
        state = {
            "msgs_in_window":      snap["window_5h"].get("msgs_used", 0),
            "observed_cap_5h":     snap["window_5h"].get("msgs_observed_max", self._observed_max_msgs()),
            "weekly_hours_used":   snap["weekly"][f"{family}_hours_used"],
            "observed_cap_weekly": snap["weekly"][f"{family}_observed_max"],
            "avg_minutes_per_msg": self._avg_minutes_per_msg(family),
        }
        return _forecast(
            planned_msgs=planned_msgs, model=model, state=state,
            caution_threshold=self.cfg.caution_threshold,
            stop_threshold=self.cfg.stop_threshold,
        )

    def recent_sessions(self, *, limit: int = 10) -> list[dict]:
        rows = list(self.conn.execute("""
            SELECT session_id, project_path,
                   MIN(ts_utc) AS started_at,
                   MAX(ts_utc) AS ended_at,
                   SUM(input_tokens)  AS input_tokens,
                   SUM(output_tokens) AS output_tokens,
                   SUM(cache_read)    AS cache_read
            FROM messages
            GROUP BY session_id
            ORDER BY ended_at DESC
            LIMIT ?
        """, (limit,)))
        return [dict(r) for r in rows]
