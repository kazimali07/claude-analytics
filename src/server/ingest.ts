import { readFileSync, statSync } from 'fs';
import { basename } from 'path';
import { glob } from 'glob';
import type { DuckDBConnection } from '@duckdb/node-api';
import type { MessageRow } from './types.js';
import { computeCost, modelFamily } from './pricing.js';
import { query } from './db.js';

export function extractTools(content: unknown[]): string[] {
  return content
    .filter((c): c is { type: string; name: string } =>
      typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'tool_use'
    )
    .map(c => c.name);
}

export function parseLine(
  line: string,
  sourceFile: string,
  sourceOffset: number
): MessageRow | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (obj.type !== 'assistant') return null;

  const msg = (obj.message ?? {}) as Record<string, unknown>;
  const usage = msg.usage as Record<string, unknown> | undefined;
  if (!usage) return null;

  const requestId = (obj.requestId ?? obj.uuid) as string | undefined;
  const sessionId = obj.sessionId as string | undefined;
  const timestamp = obj.timestamp as string | undefined;
  if (!requestId || !sessionId || !timestamp) return null;

  const cwd = (obj.cwd as string) ?? '';
  const projectName = basename(cwd) || 'unknown';
  const model = (msg.model as string) ?? 'unknown';
  const content = (msg.content as unknown[]) ?? [];

  const inputTokens = Number(usage.input_tokens ?? 0);
  const outputTokens = Number(usage.output_tokens ?? 0);
  const cacheRead = Number(usage.cache_read_input_tokens ?? 0);
  const cacheWrite = Number(usage.cache_creation_input_tokens ?? 0);

  return {
    request_id: requestId,
    session_id: sessionId,
    project_path: cwd,
    project_name: projectName,
    ts_utc: timestamp,
    model,
    model_family: modelFamily(model),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read: cacheRead,
    cache_write: cacheWrite,
    cost_usd: computeCost(model, {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read: cacheRead,
      cache_write: cacheWrite,
    }),
    tools_used: extractTools(content),
    stop_reason: (msg.stop_reason as string) ?? null,
    git_branch: (obj.gitBranch as string) ?? null,
    source_file: sourceFile,
    source_offset: sourceOffset,
  };
}

export async function ingestFile(
  conn: DuckDBConnection,
  filePath: string
): Promise<number> {
  // Get last offset
  const cursors = await query<{ last_offset: number }>(
    conn,
    `SELECT last_offset FROM ingest_cursor WHERE source_file = '${filePath.replace(/'/g, "''")}'`
  );
  const startOffset = cursors[0]?.last_offset ?? 0;

  let fileSize: number;
  try {
    fileSize = statSync(filePath).size;
  } catch {
    return 0;
  }

  // If file shrank (truncated), reset
  const effectiveStart = fileSize < startOffset ? 0 : startOffset;

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let inserted = 0;
  let byteOffset = 0;
  const encoder = new TextEncoder();

  for (const line of lines) {
    const lineBytes = encoder.encode(line + '\n').length;
    if (byteOffset >= effectiveStart && line.trim()) {
      const row = parseLine(line, filePath, byteOffset);
      if (row) {
        const toolsLiteral = '[' + row.tools_used.map(t => `'${t.replace(/'/g, "''")}'`).join(', ') + ']';
        await conn.run(`
          INSERT OR IGNORE INTO messages VALUES (
            '${row.request_id.replace(/'/g, "''")}',
            '${row.session_id.replace(/'/g, "''")}',
            '${row.project_path.replace(/'/g, "''")}',
            '${row.project_name.replace(/'/g, "''")}',
            '${row.ts_utc}',
            '${row.model.replace(/'/g, "''")}',
            '${row.model_family}',
            ${row.input_tokens},
            ${row.output_tokens},
            ${row.cache_read},
            ${row.cache_write},
            ${row.cost_usd},
            ${toolsLiteral}::VARCHAR[],
            ${row.stop_reason ? `'${row.stop_reason}'` : 'NULL'},
            ${row.git_branch ? `'${row.git_branch.replace(/'/g, "''")}'` : 'NULL'},
            '${row.source_file.replace(/'/g, "''")}',
            ${row.source_offset}
          )
        `);
        inserted++;
      }
    }
    byteOffset += lineBytes;
  }

  // Update cursor
  await conn.run(`
    INSERT OR REPLACE INTO ingest_cursor VALUES (
      '${filePath.replace(/'/g, "''")}',
      ${byteOffset},
      NOW()
    )
  `);

  return inserted;
}

export async function ingestAll(
  conn: DuckDBConnection,
  projectsDir: string
): Promise<{ files: number; rows: number }> {
  const files = await glob('**/*.jsonl', { cwd: projectsDir, absolute: true });
  let totalRows = 0;
  for (const file of files) {
    totalRows += await ingestFile(conn, file);
  }
  return { files: files.length, rows: totalRows };
}
