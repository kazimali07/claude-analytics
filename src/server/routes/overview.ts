import type { FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';
import { query } from '../db.js';

export async function overviewRoutes(app: FastifyInstance, conn: DuckDBConnection) {
  app.get('/api/overview', async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const fromClause = from ? `AND ts_utc >= '${from.replace(/'/g, "''")}'` : '';
    const toClause = to ? `AND ts_utc <= '${to.replace(/'/g, "''")}'` : '';
    const where = `WHERE 1=1 ${fromClause} ${toClause}`;

    const [kpis] = await query<{
      total_cost: number; total_calls: number; total_sessions: number;
      cache_hit_rate: number; opus_pct: number;
    }>(conn, `
      SELECT
        ROUND(SUM(cost_usd), 2)                                               AS total_cost,
        COUNT(*)                                                              AS total_calls,
        COUNT(DISTINCT session_id)                                            AS total_sessions,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        ROUND(SUM(CASE WHEN model_family = 'opus' THEN 1 ELSE 0 END)::DOUBLE / COUNT(*), 3) AS opus_pct
      FROM messages ${where}
    `);

    const trend = await query<{ date: string; calls: number; cost: number }>(conn, `
      SELECT
        strftime(ts_utc::TIMESTAMP, '%Y-%m-%d') AS date,
        COUNT(*)                                AS calls,
        ROUND(SUM(cost_usd), 4)                AS cost
      FROM messages ${where}
      GROUP BY date ORDER BY date
    `);

    const monthly = await query<{
      month: string; calls: number; cost: number; sessions: number;
      cache_hit_rate: number; opus_pct: number;
    }>(conn, `
      SELECT
        strftime(ts_utc::TIMESTAMP, '%Y-%m')   AS month,
        COUNT(*)                               AS calls,
        ROUND(SUM(cost_usd), 2)               AS cost,
        COUNT(DISTINCT session_id)             AS sessions,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        ROUND(SUM(CASE WHEN model_family = 'opus' THEN 1 ELSE 0 END)::DOUBLE / COUNT(*), 3) AS opus_pct
      FROM messages ${where}
      GROUP BY month ORDER BY month
    `);

    const modelMix = await query<{ model_family: string; count: number; pct: number }>(conn, `
      SELECT
        model_family,
        COUNT(*) AS count,
        ROUND(COUNT(*)::DOUBLE / (SELECT COUNT(*) FROM messages ${where}), 3) AS pct
      FROM messages ${where}
      GROUP BY model_family ORDER BY count DESC
    `);

    return reply.send({ kpis, trend, monthly, modelMix });
  });
}
