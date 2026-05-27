"""Pure verdict logic. State comes in, verdict goes out."""
from typing import Literal, TypedDict


class Verdict(TypedDict):
    verdict: Literal["go", "caution", "stop"]
    reason: str
    window_ok: bool
    weekly_ok: bool
    headroom_msgs_5h: int
    headroom_hours_weekly: float
    projected_pct_5h: float
    projected_pct_weekly: float


def forecast(
    *,
    planned_msgs: int,
    model: str,
    state: dict,
    caution_threshold: float = 0.75,
    stop_threshold: float = 0.95,
) -> Verdict:
    msgs_in_window      = state["msgs_in_window"]
    cap_5h              = state["observed_cap_5h"]
    weekly_hours        = state["weekly_hours_used"]
    cap_weekly          = state["observed_cap_weekly"]
    avg_min_per_msg     = state["avg_minutes_per_msg"]

    projected_msgs_5h    = msgs_in_window + planned_msgs
    projected_pct_5h     = projected_msgs_5h / cap_5h if cap_5h else 0.0

    projected_weekly_h   = weekly_hours + (planned_msgs * avg_min_per_msg) / 60.0
    projected_pct_weekly = projected_weekly_h / cap_weekly if cap_weekly else 0.0

    worst = max(projected_pct_5h, projected_pct_weekly)
    if worst >= stop_threshold:
        verdict: Literal["go", "caution", "stop"] = "stop"
    elif worst >= caution_threshold:
        verdict = "caution"
    else:
        verdict = "go"

    window_ok = projected_pct_5h     < stop_threshold
    weekly_ok = projected_pct_weekly < stop_threshold

    if projected_pct_5h >= projected_pct_weekly:
        reason = f"5h window projection: {projected_msgs_5h}/{cap_5h} ({projected_pct_5h:.0%})"
    else:
        reason = f"weekly projection: {projected_weekly_h:.1f}/{cap_weekly}h ({projected_pct_weekly:.0%})"

    return Verdict(
        verdict=verdict,
        reason=reason,
        window_ok=window_ok,
        weekly_ok=weekly_ok,
        headroom_msgs_5h=max(0, cap_5h - projected_msgs_5h),
        headroom_hours_weekly=max(0.0, cap_weekly - projected_weekly_h),
        projected_pct_5h=projected_pct_5h,
        projected_pct_weekly=projected_pct_weekly,
    )
