import { describe, it, expect } from 'vitest';
import { computeCost, modelFamily } from '../src/server/pricing.js';

describe('modelFamily', () => {
  it('extracts opus', () => expect(modelFamily('claude-opus-4-7')).toBe('opus'));
  it('extracts sonnet', () => expect(modelFamily('claude-sonnet-4-6')).toBe('sonnet'));
  it('extracts haiku', () => expect(modelFamily('claude-haiku-4-5-20251001')).toBe('haiku'));
  it('returns other for unknown', () => expect(modelFamily('gpt-4')).toBe('other'));
});

describe('computeCost', () => {
  it('computes opus cost correctly', () => {
    // opus: input $15/MTok
    const cost = computeCost('claude-opus-4-7', {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_read: 0,
      cache_write: 0,
    });
    expect(cost).toBeCloseTo(15.0);
  });

  it('computes cache read cost correctly', () => {
    const cost = computeCost('claude-opus-4-7', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read: 1_000_000,
      cache_write: 0,
    });
    expect(cost).toBeCloseTo(1.5);
  });

  it('returns 0 for unknown model', () => {
    const cost = computeCost('unknown-model', {
      input_tokens: 1000,
      output_tokens: 1000,
      cache_read: 0,
      cache_write: 0,
    });
    expect(cost).toBe(0);
  });
});
