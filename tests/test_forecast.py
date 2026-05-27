from claude_usage.forecast import forecast, Verdict


def base_state(**overrides):
    s = {
        "msgs_in_window": 50,
        "observed_cap_5h": 200,
        "weekly_hours_used": 5.0,
        "observed_cap_weekly": 20.0,
        "avg_minutes_per_msg": 1.0,
    }
    s.update(overrides)
    return s


def test_low_usage_returns_go():
    v = forecast(planned_msgs=10, model="opus", state=base_state())
    assert v["verdict"] == "go"
    assert v["window_ok"] is True
    assert v["weekly_ok"] is True


def test_high_usage_returns_caution_at_75_percent():
    # 50 used + 100 planned = 150 / 200 = 0.75 → caution
    v = forecast(planned_msgs=100, model="opus", state=base_state())
    assert v["verdict"] == "caution"


def test_very_high_usage_returns_stop_at_95_percent():
    # 50 + 140 = 190 / 200 = 0.95 → stop
    v = forecast(planned_msgs=140, model="opus", state=base_state())
    assert v["verdict"] == "stop"
    assert v["window_ok"] is False


def test_weekly_dominates_when_higher_than_5h():
    # 5h cap fine, weekly almost exhausted: 19 / 20 = 0.95 → stop
    v = forecast(planned_msgs=1, model="opus", state=base_state(weekly_hours_used=19.0))
    assert v["verdict"] == "stop"
    assert v["weekly_ok"] is False


def test_custom_thresholds_override_defaults():
    v = forecast(planned_msgs=10, model="opus", state=base_state(),
                 caution_threshold=0.10, stop_threshold=0.20)
    # 60/200 = 0.30 → above stop
    assert v["verdict"] == "stop"
