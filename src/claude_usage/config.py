"""Load ~/.claude-usage/config.toml or return defaults."""
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class Config:
    msgs_per_5h_window:  Optional[int]   = None
    weekly_opus_hours:   Optional[float] = None
    weekly_sonnet_hours: Optional[float] = None
    caution_threshold:   float = 0.75
    stop_threshold:      float = 0.95
    mcp_host:            str   = "127.0.0.1"
    mcp_port:            int   = 7878


def load_config(path: Path) -> Config:
    if not path.exists():
        return Config()
    data = tomllib.loads(path.read_text())
    caps     = data.get("caps", {})
    forecast = data.get("forecast", {})
    mcp      = data.get("mcp", {})
    return Config(
        msgs_per_5h_window  = caps.get("msgs_per_5h_window"),
        weekly_opus_hours   = caps.get("weekly_opus_hours"),
        weekly_sonnet_hours = caps.get("weekly_sonnet_hours"),
        caution_threshold   = forecast.get("caution_threshold", 0.75),
        stop_threshold      = forecast.get("stop_threshold", 0.95),
        mcp_host            = mcp.get("host", "127.0.0.1"),
        mcp_port            = mcp.get("port", 7878),
    )


DEFAULT_PATH = Path.home() / ".claude-usage" / "config.toml"
