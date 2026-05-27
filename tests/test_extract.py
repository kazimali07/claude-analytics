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
