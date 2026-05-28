import { describe, it, expect } from 'vitest';
import { parseLine, extractTools } from '../src/server/ingest.js';

describe('parseLine', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-opus-4-7',
      content: [{ type: 'tool_use', name: 'Bash', id: 't1', input: {} }],
      stop_reason: 'tool_use',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 200,
        cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 0 },
      },
    },
    requestId: 'req-001',
    sessionId: 'sess-001',
    timestamp: '2026-05-10T08:00:05.000Z',
    cwd: '/Users/test/CodingEnv/MyApp',
    gitBranch: 'main',
  });

  it('returns null for non-assistant lines', () => {
    expect(parseLine('{"type":"user"}', 'f.jsonl', 0)).toBeNull();
  });

  it('returns null when usage is missing', () => {
    expect(parseLine('{"type":"assistant","message":{}}', 'f.jsonl', 0)).toBeNull();
  });

  it('extracts all fields correctly', () => {
    const row = parseLine(line, '/path/to/session.jsonl', 42);
    expect(row).not.toBeNull();
    expect(row!.request_id).toBe('req-001');
    expect(row!.session_id).toBe('sess-001');
    expect(row!.project_name).toBe('MyApp');
    expect(row!.model).toBe('claude-opus-4-7');
    expect(row!.model_family).toBe('opus');
    expect(row!.input_tokens).toBe(100);
    expect(row!.output_tokens).toBe(50);
    expect(row!.cache_read).toBe(5000);
    expect(row!.cache_write).toBe(200);
    expect(row!.tools_used).toEqual(['Bash']);
    expect(row!.cost_usd).toBeGreaterThan(0);
    expect(row!.source_offset).toBe(42);
  });

  it('falls back to uuid when requestId absent', () => {
    const noReq = JSON.stringify({ ...JSON.parse(line), requestId: undefined, uuid: 'uuid-fallback' });
    const row = parseLine(noReq, 'f.jsonl', 0);
    expect(row!.request_id).toBe('uuid-fallback');
  });
});

describe('extractTools', () => {
  it('returns names from tool_use content blocks', () => {
    const content = [
      { type: 'tool_use', name: 'Bash', id: 't1', input: {} },
      { type: 'text', text: 'hello' },
      { type: 'tool_use', name: 'Edit', id: 't2', input: {} },
    ];
    expect(extractTools(content)).toEqual(['Bash', 'Edit']);
  });

  it('returns empty array for non-tool content', () => {
    expect(extractTools([{ type: 'text', text: 'hi' }])).toEqual([]);
  });
});
