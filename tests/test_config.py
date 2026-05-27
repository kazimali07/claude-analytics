from pathlib import Path
from claude_usage.config import load_config, Config


def test_load_config_defaults_when_file_missing(tmp_path: Path):
    cfg = load_config(tmp_path / "missing.toml")
    assert isinstance(cfg, Config)
    assert cfg.msgs_per_5h_window is None
    assert cfg.weekly_opus_hours is None
    assert cfg.weekly_sonnet_hours is None
    assert cfg.caution_threshold == 0.75
    assert cfg.stop_threshold == 0.95
    assert cfg.mcp_host == "127.0.0.1"
    assert cfg.mcp_port == 7878


def test_load_config_reads_overrides(tmp_path: Path):
    path = tmp_path / "config.toml"
    path.write_text("""
[caps]
msgs_per_5h_window  = 220
weekly_opus_hours   = 30.0
weekly_sonnet_hours = 250.0

[forecast]
caution_threshold = 0.80
stop_threshold    = 0.97

[mcp]
host = "0.0.0.0"
port = 9000
""")
    cfg = load_config(path)
    assert cfg.msgs_per_5h_window == 220
    assert cfg.weekly_opus_hours == 30.0
    assert cfg.weekly_sonnet_hours == 250.0
    assert cfg.caution_threshold == 0.80
    assert cfg.stop_threshold == 0.97
    assert cfg.mcp_host == "0.0.0.0"
    assert cfg.mcp_port == 9000
