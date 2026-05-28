export type ModelFamily = 'opus' | 'sonnet' | 'haiku' | 'other';

interface Pricing {
  input: number;       // $ per million tokens
  output: number;
  cache_read: number;
  cache_write: number;
}

// Prices as of May 2026 — update as Anthropic changes pricing
const PRICING: Record<string, Pricing> = {
  opus: { input: 15.0, output: 75.0, cache_read: 1.5, cache_write: 3.75 },
  sonnet: { input: 3.0, output: 15.0, cache_read: 0.3, cache_write: 0.375 },
  haiku: { input: 0.8, output: 4.0, cache_read: 0.08, cache_write: 0.1 },
};

export function modelFamily(model: string): ModelFamily {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'other';
}

export function computeCost(
  model: string,
  tokens: { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number }
): number {
  const family = modelFamily(model);
  const p = PRICING[family];
  if (!p) return 0;
  const M = 1_000_000;
  return (
    (tokens.input_tokens / M) * p.input +
    (tokens.output_tokens / M) * p.output +
    (tokens.cache_read / M) * p.cache_read +
    (tokens.cache_write / M) * p.cache_write
  );
}
