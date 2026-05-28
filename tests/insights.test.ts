import { describe, it, expect } from 'vitest';
import { generateRuleInsights } from '../src/server/insights.js';
import type { OverviewStats } from '../src/server/insights.js';

const base: OverviewStats = {
  total_cost: 50,
  total_calls: 1000,
  total_sessions: 20,
  cache_hit_rate: 0.65,
  opus_pct: 0.50,
  project_name: undefined,
};

describe('generateRuleInsights', () => {
  it('flags high opus usage above 65%', () => {
    const insights = generateRuleInsights({ ...base, opus_pct: 0.72 });
    expect(insights.some(i => i.type === 'warning' && i.title.toLowerCase().includes('opus'))).toBe(true);
  });

  it('does not flag opus when below threshold', () => {
    const insights = generateRuleInsights({ ...base, opus_pct: 0.50 });
    expect(insights.some(i => i.title.toLowerCase().includes('opus usage'))).toBe(false);
  });

  it('flags low cache hit rate below 50%', () => {
    const insights = generateRuleInsights({ ...base, cache_hit_rate: 0.35 });
    expect(insights.some(i => i.type === 'warning' && i.title.toLowerCase().includes('cache'))).toBe(true);
  });

  it('generates success insight for good cache rate', () => {
    const insights = generateRuleInsights({ ...base, cache_hit_rate: 0.72 });
    expect(insights.some(i => i.type === 'success' && i.title.toLowerCase().includes('cache'))).toBe(true);
  });
});
