import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { Config } from './types.js';

const CONFIG_DIR = join(homedir(), '.claude-analytics');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

const DEFAULTS: Config = {
  port: 3333,
  openBrowser: true,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  projectsDir: join(homedir(), '.claude', 'projects'),
  dbPath: join(CONFIG_DIR, 'db.duckdb'),
};

export function loadConfig(): Config {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
  try {
    const saved = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<Config>;
    // ANTHROPIC_API_KEY env var takes precedence
    if (process.env.ANTHROPIC_API_KEY) saved.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    return { ...DEFAULTS, ...saved };
  } catch {
    // Corrupted config — return defaults
    return { ...DEFAULTS };
  }
}
