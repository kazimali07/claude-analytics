# claude-usage

Local dashboard tracking personal Claude Code usage against Anthropic Max 5x limits, exposed over MCP so other Claude sessions can forecast `go / caution / stop` before running tasks.

## Quick start

```bash
uv sync
uv run claude-usage --help

# One-time: create the data dir
mkdir -p ~/.claude-usage

# Boot the tmux session
./bin/claude-usage-up
```

## Daily use

**Detach** (leave the session running in the background, return to your shell):

```
Ctrl-B  then  D
```

**Reattach** to the running session:

```bash
tmux a -t claude-dash
```

**Re-run from scratch** — first check whether a session is still alive:

```bash
tmux ls
```

- If `claude-dash` is listed → `tmux a -t claude-dash` reattaches you.
- If nothing's listed (or `no server running` error) → `./bin/claude-usage-up` boots a fresh session.

The `up` script is idempotent: if `claude-dash` already exists it just attaches you; otherwise it creates the four panes.

**Stop everything**:

```bash
./bin/claude-usage-down
```

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
