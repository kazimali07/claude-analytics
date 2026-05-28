export interface MessageRow {
  request_id: string;
  session_id: string;
  project_path: string;
  project_name: string;
  ts_utc: string;
  model: string;
  model_family: 'opus' | 'sonnet' | 'haiku' | 'other';
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
  tools_used: string[];
  stop_reason: string | null;
  git_branch: string | null;
  source_file: string;
  source_offset: number;
}

export interface SessionRow {
  session_id: string;
  project_name: string;
  started_at: string;
  ended_at: string;
  message_count: number;
  total_tokens: number;
  total_cost_usd: number;
  cache_hit_rate: number;
  primary_model: string;
}

export interface Config {
  port: number;
  openBrowser: boolean;
  anthropicApiKey: string;
  projectsDir: string;
  dbPath: string;
}

export interface RuleInsight {
  title: string;
  body: string;
  type: 'warning' | 'success' | 'info';
  action?: string;
}
