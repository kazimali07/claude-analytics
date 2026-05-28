# claude-analytics

Local web dashboard for Claude Code usage analytics. Reads your `~/.claude/projects/**/*.jsonl` session logs, stores them in a local DuckDB file, and serves a React dashboard at `localhost:3333`.

![Dashboard showing KPI strip, trend chart, project bars, model mix, and insights panel]

## Quick start

```bash
npx claude-analytics
```

That's it. No install, no config. Opens your browser automatically.

## What it shows

**Dashboard**
- Total cost, API calls, sessions, cache hit rate, Opus usage — with period-over-period deltas
- Daily cost/call trend chart with optional compare overlay
- Per-project cost bars (click any project to drill in)
- Model mix donut (Opus / Sonnet / Haiku / other)
- Efficiency panel: cost per session, calls per session
- Rule-based insights + optional AI analysis via Claude Haiku

**Project detail**
- Session list with call volume bars and model badges
- Tool usage breakdown
- AI "Second Brain" panel — ask questions about the project
- Monetisation path generator (AI, on demand)

## Filter & compare

Use the filter bar to select a date range (7d / 30d / 90d / All or custom). Toggle **Compare** to overlay the previous equivalent period on all charts.

## Configuration

On first run, `~/.claude-analytics/config.json` is created with defaults:

```json
{
  "port": 3333,
  "openBrowser": true,
  "anthropicApiKey": "",
  "projectsDir": "~/.claude/projects",
  "dbPath": "~/.claude-analytics/db.duckdb"
}
```

Set `ANTHROPIC_API_KEY` in your environment (or in the config file) to enable AI insights and the Second Brain panel.

## How it works

1. On startup, the server scans all `.jsonl` files under `projectsDir` and ingests new entries into DuckDB (incremental via a byte-offset cursor table — re-running is fast).
2. The Fastify server serves the pre-built React SPA and a REST API (`/api/overview`, `/api/projects`, `/api/sessions`, `/api/insights`).
3. AI insights are generated on demand via `claude-haiku-4-5` and cached in DuckDB by a hash of the current stats — no repeated API calls.

## Development

```bash
git clone https://github.com/kazimali07/claude-analytics
cd claude-analytics
npm install

# Run server + client in watch mode (two terminals)
npm run dev:server   # Fastify on :3333
npm run dev:client   # Vite on :5173 (proxies /api → :3333)

# Tests
npm test

# Production build
npm run build
node dist-server/index.js
```

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+, TypeScript (ESM) |
| Server | Fastify 5 |
| Database | DuckDB (`@duckdb/node-api` 1.5.3) |
| Frontend | React 18 + Vite 6 + Tailwind 3 |
| Charts | Recharts |
| AI | Anthropic SDK — `claude-haiku-4-5-20251001` |
| Tests | Vitest |

## Data and privacy

Everything stays local. The DuckDB file lives at `~/.claude-analytics/db.duckdb`. No data is sent anywhere unless you click "Analyse with Claude" or "Generate with AI", which calls the Anthropic API with aggregated stats (no raw conversation content).
