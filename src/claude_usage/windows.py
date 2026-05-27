"""Pure functions over message timestamps. No I/O."""
from datetime import datetime, timedelta
from typing import Iterable, Optional

WINDOW = timedelta(hours=5)
WEEK = timedelta(days=7)


def _parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def current_5h_window(
    timestamps: Iterable[str],
    *,
    now: datetime,
) -> Optional[tuple[datetime, datetime]]:
    """Return (start, end) of the active 5-hour window, or None if no window is active.

    Models Anthropic's session-window behavior: a window starts at the first
    message after the previous window expired (or the first message ever), and
    expires exactly 5 hours later — regardless of how many messages were sent.
    The next message after expiry begins a new window.
    """
    sorted_ts = sorted(_parse(t) for t in timestamps)
    if not sorted_ts:
        return None

    # Forward-walk: every message that lands after the previous window's end
    # starts a new window.
    window_start = sorted_ts[0]
    for t in sorted_ts[1:]:
        if t >= window_start + WINDOW:
            window_start = t

    window_end = window_start + WINDOW
    if now >= window_end:
        return None   # most recent window has expired
    return window_start, window_end


def msgs_in_window(
    timestamps: Iterable[str],
    *,
    start: datetime,
    end: datetime,
) -> int:
    return sum(1 for t in timestamps if start <= _parse(t) <= end)


def model_family(model: str) -> str:
    m = model.lower()
    if "opus" in m:   return "opus"
    if "sonnet" in m: return "sonnet"
    if "haiku" in m:  return "haiku"
    return "other"


def weekly_hours_used(
    messages: Iterable[tuple[str, str]],
    *,
    family: str,
    now: datetime,
) -> float:
    """Approximate weekly active-use hours for a model family.

    Counts distinct one-minute buckets in the rolling 7-day window that
    contain at least one message of the given family.
    """
    cutoff = now - WEEK
    minute_buckets: set[tuple[int, int, int, int, int]] = set()
    for ts, model in messages:
        if model_family(model) != family:
            continue
        t = _parse(ts)
        if t < cutoff:
            continue
        minute_buckets.add((t.year, t.month, t.day, t.hour, t.minute))
    return len(minute_buckets) / 60.0
