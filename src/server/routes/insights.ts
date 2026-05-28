import type { FastifyInstance } from 'fastify';
import type { DuckDBConnection } from '@duckdb/node-api';

export async function insightRoutes(
  _app: FastifyInstance,
  _conn: DuckDBConnection,
  _apiKey: string
): Promise<void> {
  // Implemented in Task 6
}
