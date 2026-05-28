import { DuckDBInstance } from '@duckdb/node-api';
import type { DuckDBConnection } from '@duckdb/node-api';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  request_id    VARCHAR PRIMARY KEY,
  session_id    VARCHAR NOT NULL,
  project_path  VARCHAR NOT NULL,
  project_name  VARCHAR NOT NULL,
  ts_utc        TIMESTAMPTZ NOT NULL,
  model         VARCHAR NOT NULL,
  model_family  VARCHAR NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cache_read    INTEGER NOT NULL,
  cache_write   INTEGER NOT NULL,
  cost_usd      DOUBLE NOT NULL,
  tools_used    VARCHAR[],
  stop_reason   VARCHAR,
  git_branch    VARCHAR,
  source_file   VARCHAR NOT NULL,
  source_offset BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_cursor (
  source_file VARCHAR PRIMARY KEY,
  last_offset BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS insights_cache (
  scope         VARCHAR NOT NULL,
  stats_hash    VARCHAR NOT NULL,
  insights_json TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, stats_hash)
);

CREATE TABLE IF NOT EXISTS project_goals (
  project_name VARCHAR PRIMARY KEY,
  goal_text    VARCHAR,
  category     VARCHAR,
  updated_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_messages_ts       ON messages(ts_utc);
CREATE INDEX IF NOT EXISTS ix_messages_session  ON messages(session_id);
CREATE INDEX IF NOT EXISTS ix_messages_project  ON messages(project_name);

CREATE VIEW IF NOT EXISTS sessions AS
SELECT
  session_id,
  project_name,
  MIN(ts_utc)::VARCHAR                                              AS started_at,
  MAX(ts_utc)::VARCHAR                                              AS ended_at,
  COUNT(*)                                                          AS message_count,
  SUM(input_tokens + output_tokens)                                 AS total_tokens,
  SUM(cost_usd)                                                     AS total_cost_usd,
  SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0) AS cache_hit_rate,
  mode(model_family)                                                AS primary_model
FROM messages
GROUP BY session_id, project_name;
`;

let _conn: DuckDBConnection | null = null;

export async function getConnection(dbPath: string): Promise<DuckDBConnection> {
  if (_conn) return _conn;
  try {
    const instance = await DuckDBInstance.create(dbPath);
    _conn = await instance.connect();
    // Bootstrap schema
    for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) {
      await _conn.run(stmt);
    }
    return _conn;
  } catch (err) {
    _conn = null;
    throw new Error(`Failed to open DuckDB at ${dbPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function query<T = Record<string, unknown>>(
  conn: DuckDBConnection,
  sql: string,
): Promise<T[]> {
  const result = await conn.runAndReadAll(sql);
  return result.getRowObjects() as T[];
}
