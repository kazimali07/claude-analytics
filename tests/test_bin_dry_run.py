import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def test_up_dry_run_prints_tmux_commands():
    result = subprocess.run(
        [str(REPO / "bin" / "claude-usage-up"), "--dry-run"],
        capture_output=True, text=True, check=True,
    )
    out = result.stdout
    assert "tmux new-session" in out
    assert "claude-usage tui gauge" in out
    assert "claude-usage tui sessions" in out
    assert "claude-usage daemon" in out
    assert "claude-usage mcp" in out
