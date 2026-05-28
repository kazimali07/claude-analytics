import type { FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';
import { query } from '../db.js';

export async function sessionRoutes(app: FastifyInstance, conn: DuckDBConnection) {
  app.get('/api/sessions', async (req, reply) => {
    const { from, to, project, limit = '20' } = req.query as {
      from?: string; to?: string; project?: string; limit?: string;
    };
    const clauses = ['1=1'];
    if (project) clauses.push(`project_name = '${project.replace(/'/g, "''")}'`);
    if (from) clauses.push(`ts_utc >= '${from.replace(/'/g, "''")}'`);
    if (to) clauses.push(`ts_utc <= '${to.replace(/'/g, "''")}'`);
    const where = `WHERE ${clauses.join(' AND ')}`;

    const sessions = await query<{
      session_id: string; project_name: string;
      started_at: string; ended_at: string;
      message_count: number; cost: number;
      cache_hit_rate: number; primary_model: string;
    }>(conn, `
      SELECT
        session_id,
        project_name,
        MIN(ts_utc)::VARCHAR  AS started_at,
        MAX(ts_utc)::VARCHAR  AS ended_at,
        COUNT(*)              AS message_count,
        ROUND(SUM(cost_usd), 4) AS cost,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        mode(model_family)    AS primary_model
      FROM messages ${where}
      GROUP BY session_id, project_name
      ORDER BY started_at DESC
      LIMIT ${Math.max(1, Math.min(parseInt(limit, 10) || 20, 1000))}
    `);

    return reply.send({ sessions });
  });
}
