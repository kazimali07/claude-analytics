const BASE = '/api';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE + path, window.location.href);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  overview: (params?: Record<string, string>) =>
    get<{ kpis: import('./types.js').KpiData; trend: import('./types.js').TrendPoint[]; monthly: import('./types.js').MonthRow[]; modelMix: import('./types.js').ModelMixItem[] }>('/overview', params),
  projects: (params?: Record<string, string>) =>
    get<{ projects: import('./types.js').ProjectSummary[] }>('/projects', params),
  project: (name: string, params?: Record<string, string>) =>
    get<import('./types.js').ProjectDetail>(`/projects/${encodeURIComponent(name)}`, params),
  sessions: (params?: Record<string, string>) =>
    get<{ sessions: import('./types.js').SessionRow[] }>('/sessions', params),
  insights: (scope: string, params?: Record<string, string>) =>
    get<import('./types.js').InsightsResponse>(`/insights/${encodeURIComponent(scope)}`, params),
  generateInsights: (scope: string, body: unknown) =>
    post<{ insights: import('./types.js').RuleInsight[] }>(`/insights/${encodeURIComponent(scope)}/generate`, body),
  rescan: () =>
    post<{ files: number }>('/rescan', {}),
};
