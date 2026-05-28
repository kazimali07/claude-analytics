import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import cors from '@fastify/cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { loadConfig } from './config.js';
import { getConnection } from './db.js';
import { ingestAll } from './ingest.js';
import { overviewRoutes } from './routes/overview.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { insightRoutes } from './routes/insights.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  console.log('📊 claude-analytics starting...');

  const conn = await getConnection(config.dbPath);

  console.log('🔍 Scanning', config.projectsDir);
  const { files, rows } = await ingestAll(conn, config.projectsDir);
  console.log(`✓ Ingested ${rows} new rows from ${files} files`);

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  // Serve pre-built React app
  const distPath = join(__dirname, '../dist');
  await app.register(staticPlugin, { root: distPath, prefix: '/' });

  // API routes
  await overviewRoutes(app, conn);
  await projectRoutes(app, conn);
  await sessionRoutes(app, conn);
  await insightRoutes(app, conn, config.anthropicApiKey);

  // SPA fallback
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');
  });

  await app.listen({ port: config.port, host: '127.0.0.1' });
  const url = `http://localhost:${config.port}`;
  console.log(`✓ Dashboard running at ${url}`);

  if (config.openBrowser) {
    await open(url);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
