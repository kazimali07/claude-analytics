import type { FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';
import { createHash } from 'crypto';
import { query } from '../db.js';
import { generateRuleInsights } from '../insights.js';
import type { OverviewStats } from '../insights.js';

export async function insightRoutes(
  app: FastifyInstance,
  conn: DuckDBConnection,
  anthropicApiKey: string
) {
  // GET rule-based insights (always available)
  app.get('/api/insights/:scope', async (req, reply) => {
    const { scope } = req.params as { scope: string };
    const { from, to } = req.query as { from?: string; to?: string };

    const projectName = scope.startsWith('project:') ? scope.slice(8) : undefined;
    const clauses = ['1=1'];
    if (projectName) clauses.push(`project_name = '${projectName.replace(/'/g, "''")}'`);
    if (from) clauses.push(`ts_utc >= '${from.replace(/'/g, "''")}'`);
    if (to) clauses.push(`ts_utc <= '${to.replace(/'/g, "''")}'`);
    const where = `WHERE ${clauses.join(' AND ')}`;

    const [stats] = await query<OverviewStats & { last_seen: string }>(conn, `
      SELECT
        ROUND(SUM(cost_usd), 2)   AS total_cost,
        COUNT(*)                  AS total_calls,
        COUNT(DISTINCT session_id) AS total_sessions,
        ROUND(SUM(cache_read)::DOUBLE / NULLIF(SUM(input_tokens + cache_read), 0), 3) AS cache_hit_rate,
        ROUND(SUM(CASE WHEN model_family='opus' THEN 1 ELSE 0 END)::DOUBLE / COUNT(*), 3) AS opus_pct,
        MAX(ts_utc)::VARCHAR      AS last_seen
      FROM messages ${where}
    `);

    const ruleInsights = generateRuleInsights({ ...stats, project_name: projectName });

    // Check for cached AI insights
    const statsHash = createHash('md5').update(JSON.stringify(stats)).digest('hex');
    const cached = await query<{ insights_json: string }>(conn,
      `SELECT insights_json FROM insights_cache WHERE scope = '${scope.replace(/'/g, "''")}' AND stats_hash = '${statsHash}'`
    );

    return reply.send({
      rule_insights: ruleInsights,
      ai_insights: cached[0] ? JSON.parse(cached[0].insights_json) : null,
      has_ai: !!cached[0],
      stats_hash: statsHash,
      scope,
    });
  });

  // POST generate AI insights (requires API key)
  app.post('/api/insights/:scope/generate', async (req, reply) => {
    if (!anthropicApiKey) {
      return reply.status(403).send({ error: 'No ANTHROPIC_API_KEY configured' });
    }

    const { scope } = req.params as { scope: string };
    const { stats } = req.body as { stats: OverviewStats };

    // Recompute stats_hash server-side to prevent client tampering
    const stats_hash = createHash('md5').update(JSON.stringify(stats)).digest('hex');

    // Lazy import Anthropic SDK to avoid startup cost when key not configured
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const isProject = scope.startsWith('project:');
    const projectName = isProject ? scope.slice(8) : undefined;

    const prompt = isProject
      ? `You are analysing Claude Code usage data for the project "${projectName}".
Stats: ${JSON.stringify(stats, null, 2)}
Generate 3 concise insights about this project's Claude usage patterns.
Focus on: (1) efficiency opportunities, (2) what the session patterns reveal about project stage, (3) one concrete next step.
Return JSON: { "insights": [{ "title": string, "body": string, "type": "warning"|"success"|"info", "action": string|null }] }`
      : `You are analysing overall Claude Code usage data.
Stats: ${JSON.stringify(stats, null, 2)}
Generate 3 concise insights about this developer's Claude usage patterns.
Focus on: efficiency, model selection, and usage trends.
Return JSON: { "insights": [{ "title": string, "body": string, "type": "warning"|"success"|"info", "action": string|null }] }`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    let insightsJson = '{"insights":[]}';
    try {
      const candidate = jsonMatch ? jsonMatch[0] : '{"insights":[]}';
      JSON.parse(candidate); // validate
      insightsJson = candidate;
    } catch {
      // malformed JSON from Claude — keep default empty
    }

    await conn.run(`
      INSERT OR REPLACE INTO insights_cache VALUES (
        '${scope.replace(/'/g, "''")}',
        '${stats_hash}',
        '${insightsJson.replace(/'/g, "''")}',
        NOW()
      )
    `);

    return reply.send(JSON.parse(insightsJson));
  });
}
