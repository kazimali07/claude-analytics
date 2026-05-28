# claude-analytics — CLAUDE.md

## Commands

```bash
npm run dev:server      # Fastify watch mode on :3333
npm run dev:client      # Vite dev server on :5173 (proxies /api → :3333)
npm test                # Vitest (17 tests, server-only)
npm run build           # build:client (Vite → dist/) + build:server (tsc → dist-server/)
node dist-server/index.js   # run production build
```

When running the dev client, the Fastify server must also be running — Vite proxies `/api` to `:3333`.

## Architecture

```
src/server/         Fastify + DuckDB backend (Node.js ESM)
  index.ts          entry: ingest → register routes → serve static → listen
  db.ts             DuckDB singleton, schema bootstrap, query() helper
  ingest.ts         JSONL scanner → DuckDB writer (incremental via cursor table)
  pricing.ts        model → $/MTok table + computeCost()
  insights.ts       rule-based insight generation (5 rules)
  routes/           overview, projects, sessions, insights API routes

src/client/         React 18 + Vite + Tailwind SPA
  pages/            Dashboard.tsx, Project.tsx
  components/       FilterBar, KpiStrip, TrendChart, ProjectBars, ModelMix,
                    EfficiencyPanel, InsightsPanel, AgentPanel, SessionList,
                    MonetisationPaths

tests/              Vitest — pricing, ingest (parseLine/extractTools), insights
dist/               built React SPA (gitignored)
dist-server/        compiled server JS (gitignored)
~/.claude-analytics/db.duckdb   persistent DuckDB file (outside repo)
```

## Key constraints

- **DuckDB pinned** to `1.5.3-r.2` — do not change this version.
- **ESM throughout** — all server imports use `.js` extensions even for `.ts` source files.
- **`noUnusedLocals` + `noUnusedParameters`** are both `true` — prefix unused params with `_`.
- **`sessions` is a VIEW** (`CREATE VIEW IF NOT EXISTS sessions`) not a table — don't try to insert into it.
- **DuckDB array literals** use single-quoted elements: `['foo', 'bar']::VARCHAR[]`, not JSON `["foo"]`.
- **DuckDB returns BigInt** for COUNT/INTEGER columns — `query()` in `db.ts` converts them to `Number`.
- **Static files** are served from `dist/` relative to `dist-server/` → path is `../dist` (one level up).

## Data flow

1. `ingestAll()` globs `~/.claude/projects/**/*.jsonl`
2. Each file is read from its last byte offset (stored in `ingest_cursor` table)
3. `parseLine()` extracts assistant messages with token usage into `MessageRow`
4. Rows inserted with `INSERT OR IGNORE` (request_id is PRIMARY KEY)
5. Cursor updated to current file size after each file

## AI insights

- `GET /api/insights/:scope` returns rule-based insights always; AI insights if cached
- `POST /api/insights/:scope/generate` calls Claude Haiku, caches result keyed by `(scope, stats_hash)`
- Stats hash is a SHA-256 of the serialised stats object — same data = same hash = cache hit
- Anthropic API key read from `ANTHROPIC_API_KEY` env var (takes precedence over config file)
