import type { RuleInsight } from './types.js';

export interface OverviewStats {
  total_cost: number;
  total_calls: number;
  total_sessions: number;
  cache_hit_rate: number;
  opus_pct: number;
  project_name?: string;
  last_seen?: string;
}

export function generateRuleInsights(stats: OverviewStats): RuleInsight[] {
  const insights: RuleInsight[] = [];
  const context = stats.project_name ? `on ${stats.project_name}` : 'across your projects';

  // Opus usage
  if (stats.opus_pct > 0.65) {
    insights.push({
      title: 'High Opus usage',
      body: `${Math.round(stats.opus_pct * 100)}% of calls use Opus ${context}. For debugging, testing, and read-heavy sessions, Sonnet performs equally well at ~5× lower cost.`,
      type: 'warning',
      action: 'Switch debugging sessions to Sonnet',
    });
  }

  // Cache hit rate
  if (stats.cache_hit_rate < 0.50) {
    insights.push({
      title: 'Low cache efficiency',
      body: `Cache hit rate is ${Math.round(stats.cache_hit_rate * 100)}% ${context}. Consider keeping CLAUDE.md and project context stable across sessions to improve cache reuse.`,
      type: 'warning',
      action: 'Review prompt structure for cache opportunities',
    });
  } else if (stats.cache_hit_rate > 0.65) {
    insights.push({
      title: 'Good cache efficiency',
      body: `Cache hit rate is ${Math.round(stats.cache_hit_rate * 100)}% ${context}. Your context structure is working well — Claude is reusing prior context effectively.`,
      type: 'success',
    });
  }

  // Staleness
  if (stats.last_seen) {
    const daysSince = (Date.now() - new Date(stats.last_seen).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 14) {
      insights.push({
        title: 'Project inactive',
        body: `No sessions ${context} in ${Math.round(daysSince)} days. Consider revisiting or archiving this project.`,
        type: 'info',
      });
    }
  }

  // Average session length
  if (stats.total_calls / Math.max(stats.total_sessions, 1) > 150) {
    insights.push({
      title: 'Long average sessions',
      body: `Average session is ${Math.round(stats.total_calls / stats.total_sessions)} API calls ${context}. Using /plan mode before large sessions can reduce back-and-forth by 30–40%.`,
      type: 'warning',
      action: 'Use /plan for complex tasks',
    });
  }

  return insights;
}
