import type { FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';
import { query } from '../db.js';

export async function projectRoutes(app: FastifyInstance, conn: DuckDBConnection) {
  app.get('/api/projects', async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const where = buildWhere(from, to);
    const projects = await query<{
      project_name: string; calls: number; cost: number;
      sessions: number; cache_hit_rate: number; opus_pct: number; last_seen: string;
    }>(conn, `
      SELECT
        project_name,
        COUNT(*)                  AS calls,
        ROUND(SUM(cost_usd), 2)  AS cost,
        COUNT(DISTINCT session_id) AS sessions,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        ROUND(SUM(CASE WHEN model_family='opus' THEN 1 ELSE 0 END)::DOUBLE / COUNT(*), 3) AS opus_pct,
        MAX(ts_utc)::VARCHAR      AS last_seen
      FROM messages ${where}
      GROUP BY project_name ORDER BY cost DESC
    `);
    return reply.send({ projects });
  });

  app.get('/api/projects/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const { from, to } = req.query as { from?: string; to?: string };
    const where = buildWhere(from, to, name);

    const [kpis] = await query<{
      total_calls: number; total_cost: number; total_sessions: number;
      cache_hit_rate: number; opus_pct: number;
      first_seen: string; last_seen: string;
    }>(conn, `
      SELECT
        COUNT(*)                   AS total_calls,
        ROUND(SUM(cost_usd), 2)   AS total_cost,
        COUNT(DISTINCT session_id) AS total_sessions,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        ROUND(SUM(CASE WHEN model_family='opus' THEN 1 ELSE 0 END)::DOUBLE / COUNT(*), 3) AS opus_pct,
        MIN(ts_utc)::VARCHAR       AS first_seen,
        MAX(ts_utc)::VARCHAR       AS last_seen
      FROM messages ${where}
    `);

    const sessions = await query<{
      session_id: string; started_at: string; ended_at: string;
      message_count: number; cost: number; cache_hit_rate: number; primary_model: string;
    }>(conn, `
      SELECT
        session_id,
        MIN(ts_utc)::VARCHAR AS started_at,
        MAX(ts_utc)::VARCHAR AS ended_at,
        COUNT(*)             AS message_count,
        ROUND(SUM(cost_usd), 4) AS cost,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        mode(model_family)   AS primary_model
      FROM messages ${where}
      GROUP BY session_id ORDER BY started_at DESC
    `);

    const toolUsage = await query<{ tool: string; count: number }>(conn, `
      SELECT t.tool, COUNT(*) AS count
      FROM messages, unnest(tools_used) AS t(tool)
      ${where} AND tools_used IS NOT NULL AND len(tools_used) > 0
      GROUP BY t.tool ORDER BY count DESC
    `);

    const modelMix = await query<{ model_family: string; count: number }>(conn, `
      SELECT model_family, COUNT(*) AS count
      FROM messages ${where}
      GROUP BY model_family ORDER BY count DESC
    `);

    return reply.send({ kpis, sessions, toolUsage, modelMix });
  });
}

function buildWhere(from?: string, to?: string, project?: string): string {
  const clauses = ['1=1'];
  if (project) clauses.push(`project_name = '${project.replace(/'/g, "''")}'`);
  if (from) clauses.push(`ts_utc >= '${from.replace(/'/g, "''")}'`);
  if (to) clauses.push(`ts_utc <= '${to.replace(/'/g, "''")}'`);
  return `WHERE ${clauses.join(' AND ')}`;
}
