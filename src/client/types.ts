export interface KpiData {
  total_cost: number;
  total_calls: number;
  total_sessions: number;
  cache_hit_rate: number;
  opus_pct: number;
}

export interface TrendPoint { date: string; calls: number; cost: number; }

export interface MonthRow {
  month: string; calls: number; cost: number; sessions: number;
  cache_hit_rate: number; opus_pct: number;
}

export interface ModelMixItem { model_family: string; count: number; pct: number; }

export interface ProjectSummary {
  project_name: string; calls: number; cost: number; sessions: number;
  cache_hit_rate: number; opus_pct: number; last_seen: string;
}

export interface SessionRow {
  session_id: string; project_name: string;
  started_at: string; ended_at: string;
  message_count: number; cost: number;
  cache_hit_rate: number; primary_model: string;
}

export interface RuleInsight {
  title: string; body: string; type: 'warning' | 'success' | 'info'; action?: string;
}

export interface InsightsResponse {
  rule_insights: RuleInsight[];
  ai_insights: { insights: RuleInsight[] } | null;
  has_ai: boolean;
  stats_hash: string;
  scope: string;
}

export interface ToolUsageItem { tool: string; count: number; }

export interface ProjectDetail {
  kpis: KpiData & { first_seen: string; last_seen: string };
  sessions: (SessionRow & { cost: number })[];
  toolUsage: ToolUsageItem[];
  modelMix: { model_family: string; count: number }[];
}
