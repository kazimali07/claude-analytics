import json
from pathlib import Path
from claude_usage.extract import extract_usage, MessageRow


def test_extract_usage_from_assistant_message(fixtures_dir: Path):
    line = (fixtures_dir / "sample_assistant_message.jsonl").read_text().strip()
    row = extract_usage(line, source_file="/abs/path/x.jsonl", source_offset=0)
    assert isinstance(row, MessageRow)
    assert row.request_id == "req_011CaxLvNRmbTcgwaR9QyV2p"
    assert row.session_id == "fe16106e-8416-4f40-a280-3e992f9e5c45"
    assert row.project_path == "/Users/Kazim/CodingEnv"
    assert row.ts_utc == "2026-05-12T08:17:05.848Z"
    assert row.model == "claude-opus-4-7"
    assert row.input_tokens == 6
    assert row.output_tokens == 316
    assert row.cache_read == 16963
    assert row.cache_create_1h == 10822
    assert row.cache_create_5m == 0
    assert row.service_tier == "standard"


def test_extract_usage_skips_non_assistant_message():
    line = json.dumps({"type": "user", "message": {}})
    assert extract_usage(line, source_file="x", source_offset=0) is None


def test_extract_usage_skips_assistant_without_usage():
    line = json.dumps({"type": "assistant", "message": {"role": "assistant"}})
    assert extract_usage(line, source_file="x", source_offset=0) is None


def test_extract_usage_returns_none_on_malformed_json():
    assert extract_usage("{not json", source_file="x", source_offset=0) is None


def test_extract_usage_falls_back_to_uuid_when_requestid_missing():
    line = json.dumps({
        "type": "assistant",
        "uuid": "u-fallback",
        "sessionId": "s",
        "timestamp": "2026-05-12T08:17:05.000Z",
        "cwd": "/p",
        "message": {
            "model": "claude-opus-4-7",
            "usage": {
                "input_tokens": 1, "output_tokens": 2,
                "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                "service_tier": "standard",
                "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 0},
            },
        },
    })
    row = extract_usage(line, source_file="x", source_offset=0)
    assert row is not None
    assert row.request_id == "u-fallback"


def test_extract_usage_returns_none_when_no_id_at_all():
    line = json.dumps({
        "type": "assistant",
        "sessionId": "s",
        "timestamp": "2026-05-12T08:17:05.000Z",
        "message": {"model": "x", "usage": {"input_tokens": 0, "output_tokens": 0,
                    "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                    "cache_creation": {}}},
    })
    assert extract_usage(line, source_file="x", source_offset=0) is None
