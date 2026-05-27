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
