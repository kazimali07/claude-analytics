# claude-usage

Local dashboard tracking personal Claude Code usage against Anthropic Max 5x limits, exposed over MCP so other Claude sessions can forecast `go / caution / stop` before running tasks.

## Quick start

```bash
uv sync
uv run claude-usage --help

# One-time: create the data dir
mkdir -p ~/.claude-usage

# Boot the tmux session manually
./bin/claude-usage-up
```

Detach with `Ctrl-B D`. Reattach anytime: `tmux a -t claude-dash`.

## Auto-start at login (optional)

```bash
# Edit the plist to substitute real absolute paths for REPLACE_WITH_*
cp config/com.claude-usage.plist /tmp/com.claude-usage.plist
# Then install:
cp /tmp/com.claude-usage.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.claude-usage.plist
```

## Configure other Claude Code sessions to use the MCP server

Add to a project's `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-usage": { "url": "http://localhost:7878/mcp" }
  }
}
```

Then call `forecast(planned_msgs=N, model="opus")` from the session.

## Architecture

See `docs/superpowers/specs/2026-05-27-claude-usage-dashboard-design.md`.

## Develop

```bash
uv run pytest
```
