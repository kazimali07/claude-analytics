from typer.testing import CliRunner

from claude_usage.cli import app

runner = CliRunner()


def test_help_lists_all_subcommands():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    out = result.stdout
    assert "daemon" in out
    assert "mcp" in out
    assert "tui" in out


def test_tui_help_lists_views():
    result = runner.invoke(app, ["tui", "--help"])
    assert result.exit_code == 0
    assert "gauge" in result.stdout
    assert "sessions" in result.stdout
