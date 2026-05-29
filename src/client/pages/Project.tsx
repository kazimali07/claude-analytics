import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import AgentPanel from '../components/AgentPanel.js';
import SessionList from '../components/SessionList.js';
import MonetisationPaths from '../components/MonetisationPaths.js';
import InsightsPanel from '../components/InsightsPanel.js';
import type { ProjectDetail, InsightsResponse } from '../types.js';

interface Props { name: string; onBack: () => void; }

export default function Project({ name, onBack }: Props) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [agentText, setAgentText] = useState<string | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [monoLoading, setMonoLoading] = useState(false);
  const [monoPaths, setMonoPaths] = useState<Parameters<typeof MonetisationPaths>[0]['paths']>([]);
  const [monoHasAi, setMonoHasAi] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const load = useCallback(async () => {
    const [det, ins] = await Promise.all([
      api.project(name),
      api.insights(`project:${name}`),
    ]);
    setData(det);
    setInsights(ins);
  }, [name]);

  useEffect(() => { void load(); }, [load]);

  async function handleAsk(question: string) {
    setAgentLoading(true);
    setAgentError(null);
    try {
      const scope = `project:${name}:ask`;
      const res = await api.generateInsights(scope, {
        question,
        project_name: name,
        stats: data?.kpis,
        tool_usage: data?.toolUsage,
        model_mix: data?.modelMix,
      });
      setAgentText(res.insights?.[0]?.body ?? 'No response');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAgentError(
        msg.includes('403')
          ? 'No ANTHROPIC_API_KEY configured — set it to enable AI features.'
          : `Error: ${msg}`
      );
    } finally {
      setAgentLoading(false);
    }
  }

  async function handleGenerateMonetisation() {
    setMonoLoading(true);
    try {
      const res = await api.generateInsights(`project:${name}:monetisation`, {
        project_name: name,
        stats: data?.kpis,
        tool_usage: data?.toolUsage,
      });
      const paths = (res.insights ?? []).map((ins, i) => ({
        title: ins.title,
        subtitle: '',
        body: ins.body,
        revenueRange: '—',
        revenueSub: '',
        effort: 3,
        effortLabel: ins.action ?? '',
        isBestBet: i === 0,
      }));
      setMonoPaths(paths);
      setMonoHasAi(true);
    } finally {
      setMonoLoading(false);
    }
  }

  async function handleGenerateInsights() {
    setInsightsLoading(true);
    try {
      await api.generateInsights(`project:${name}`, {
        stats: data?.kpis,
        stats_hash: insights?.stats_hash,
      });
      const fresh = await api.insights(`project:${name}`);
      setInsights(fresh);
    } finally {
      setInsightsLoading(false);
    }
  }

  if (!data) return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center text-[#64748b]">
      Loading...
    </div>
  );

  const maxCalls = Math.max(...data.sessions.map(s => s.message_count), 1);

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <div className="bg-[#1a1d27] border-b border-[#2d3148] px-7 py-3 flex items-center gap-3">
        <button onClick={onBack} className="text-[#64748b] text-sm hover:text-[#94a3b8]">← All Projects</button>
        <span className="text-[#2d3148]">/</span>
        <span className="text-[#e2e8f0] text-sm font-semibold">{name}</span>
      </div>

      {/* KPI strip */}
      <div className="bg-[#1a1d27] border-b border-[#2d3148] px-7 py-4">
        <div className="grid grid-cols-6 divide-x divide-[#2d3148]">
          {[
            { label: 'Active Period', value: `${data.kpis.first_seen?.slice(0, 10)} → ${data.kpis.last_seen?.slice(0, 10)}` },
            { label: 'Sessions', value: data.kpis.total_sessions.toLocaleString() },
            { label: 'API Calls', value: data.kpis.total_calls.toLocaleString() },
            { label: 'Cache Hit Rate', value: `${Math.round(data.kpis.cache_hit_rate * 100)}%` },
            { label: 'Opus Usage', value: `${Math.round(data.kpis.opus_pct * 100)}%` },
            { label: 'API-Equiv. Cost', value: `~$${data.kpis.total_cost.toFixed(2)}` },
          ].map(k => (
            <div key={k.label} className="px-5 first:pl-0">
              <div className="text-[10px] text-[#64748b] uppercase tracking-widest mb-1">{k.label}</div>
              <div className="text-base font-bold text-[#f1f5f9]">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-[1280px] mx-auto px-7 py-6">
        <AgentPanel projectName={name} assessment={agentText} loading={agentLoading} onAsk={handleAsk} error={agentError} />

        <div className="grid grid-cols-[7fr_3fr] gap-4 mb-4">
          <SessionList sessions={data.sessions} maxCalls={maxCalls} />
          <div>
            {/* Tool usage */}
            <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
              <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest mb-3">Tool Usage</div>
              {data.toolUsage.slice(0, 8).map(t => (
                <div key={t.tool} className="flex items-center gap-2 mb-2">
                  <div className="text-xs text-[#e2e8f0] w-24 flex-shrink-0">{t.tool}</div>
                  <div className="flex-1 h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
                    <div className="h-full bg-[#10b981] rounded-full"
                      style={{ width: `${(t.count / (data.toolUsage[0]?.count ?? 1)) * 100}%` }} />
                  </div>
                  <div className="text-[11px] text-[#64748b] w-8 text-right">{t.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <MonetisationPaths paths={monoPaths} loading={monoLoading} onGenerate={handleGenerateMonetisation} hasAi={monoHasAi} />

        <div className="grid grid-cols-2 gap-4">
          <InsightsPanel data={insights} onGenerate={handleGenerateInsights} loading={insightsLoading} />
        </div>
      </div>
    </div>
  );
}
