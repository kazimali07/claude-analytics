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

    The window starts at the first message of the contiguous tail — the earliest
    message such that every subsequent message lies within 5 hours of its predecessor.
    """
    sorted_ts = sorted(_parse(t) for t in timestamps)
    if not sorted_ts:
        return None
    if now - sorted_ts[-1] > WINDOW:
        return None

    contiguous_start = sorted_ts[-1]
    for t in reversed(sorted_ts[:-1]):
        if contiguous_start - t <= WINDOW:
            contiguous_start = t
        else:
            break
    return contiguous_start, contiguous_start + WINDOW


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
