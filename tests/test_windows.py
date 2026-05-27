from datetime import datetime, timedelta, timezone
from claude_usage.windows import (
    current_5h_window,
    msgs_in_window,
    weekly_hours_used,
    model_family,
)


UTC = timezone.utc


def ts(minutes_ago: int, *, now: datetime) -> str:
    return (now - timedelta(minutes=minutes_ago)).isoformat().replace("+00:00", "Z")


def test_no_messages_returns_none():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    assert current_5h_window([], now=now) is None


def test_only_old_messages_returns_none():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(6 * 60, now=now)]   # 6h ago
    assert current_5h_window(msgs, now=now) is None


def test_single_recent_message_starts_window():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(30, now=now)]
    start, end = current_5h_window(msgs, now=now)
    assert (now - start).total_seconds() == 30 * 60
    assert (end - start) == timedelta(hours=5)


def test_window_anchors_on_first_message_after_gap():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [
        ts(6 * 60, now=now),     # 6h ago — outside current window
        ts(20, now=now),         # 20 min ago — starts the current window
        ts(10, now=now),         # within current window
    ]
    start, end = current_5h_window(msgs, now=now)
    assert (now - start).total_seconds() == 20 * 60


def test_continuous_activity_starts_window_after_each_5h_lapse():
    # User active for many hours — should NOT roll into one giant window.
    # Each msg landing after the previous window's end starts a fresh window.
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [
        ts(12 * 60, now=now),    # T-12h (05:00) starts W1, ends 10:00
        ts(10 * 60, now=now),    # T-10h (07:00) — inside W1
        ts(6 * 60,  now=now),    # T-6h  (11:00) — after W1 expired, starts W2 (ends 16:00)
        ts(2 * 60,  now=now),    # T-2h  (15:00) — inside W2
        ts(30,      now=now),    # T-30m (16:30) — after W2 expired, starts W3 (ends 21:30)
    ]
    start, end = current_5h_window(msgs, now=now)
    # Current window is W3, started 30 minutes ago at 16:30.
    assert (now - start).total_seconds() == 30 * 60


def test_window_expired_returns_none():
    # Most recent msg is 1 minute ago, but its window started 5h 1min ago,
    # so the window has already expired. Next msg would start a fresh one.
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [
        ts(5 * 60 + 1, now=now),    # T-5h1m: started a window that ends at T-1m
        ts(1, now=now),             # T-1m: this is OUTSIDE the prior window;
                                     # it actually starts a fresh window that is still active
    ]
    start, end = current_5h_window(msgs, now=now)
    # The current window started 1 minute ago, not 5h1m ago.
    assert (now - start).total_seconds() == 60


def test_msgs_in_window_counts_inclusive():
    now = datetime(2026, 5, 27, 17, 0, tzinfo=UTC)
    msgs = [ts(20, now=now), ts(10, now=now), ts(0, now=now)]
    start, end = current_5h_window(msgs, now=now)
    assert msgs_in_window(msgs, start=start, end=end) == 3


def test_model_family_buckets():
    assert model_family("claude-opus-4-7") == "opus"
    assert model_family("claude-sonnet-4-6") == "sonnet"
    assert model_family("claude-haiku-4-5") == "haiku"
    assert model_family("some-future-model") == "other"


def test_weekly_hours_counts_distinct_minute_buckets():
    base = datetime(2026, 5, 27, 12, 0, tzinfo=UTC)
    msgs = [
        (base.isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(seconds=5)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(seconds=59)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        ((base + timedelta(minutes=1)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
    ]
    now = base + timedelta(hours=1)
    hours = weekly_hours_used(msgs, family="opus", now=now)
    assert hours == 2 / 60   # exactly 2 minute-buckets


def test_weekly_hours_excludes_older_than_7_days():
    base = datetime(2026, 5, 27, 12, 0, tzinfo=UTC)
    msgs = [
        ((base - timedelta(days=8)).isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
        (base.isoformat().replace("+00:00", "Z"), "claude-opus-4-7"),
    ]
    assert weekly_hours_used(msgs, family="opus", now=base) == 1 / 60
