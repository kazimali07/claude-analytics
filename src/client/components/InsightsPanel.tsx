import type { InsightsResponse, RuleInsight } from '../types.js';

const TYPE_STYLES = {
  warning: { border: 'border-l-[#f59e0b]', bg: 'bg-[#1c1400]', title: 'text-[#fbbf24]' },
  success: { border: 'border-l-[#10b981]', bg: 'bg-[#021a0a]', title: 'text-[#34d399]' },
  info: { border: 'border-l-[#3b82f6]', bg: 'bg-[#051020]', title: 'text-[#60a5fa]' },
};

function InsightCard({ insight }: { insight: RuleInsight }) {
  const s = TYPE_STYLES[insight.type] ?? TYPE_STYLES.info;
  return (
    <div className={`${s.bg} ${s.border} border border-[#2d3148] border-l-[3px] rounded-lg p-3.5 mb-2.5`}>
      <div className={`text-xs font-semibold ${s.title} mb-1.5`}>{insight.title}</div>
      <div className="text-xs text-[#94a3b8] leading-relaxed">{insight.body}</div>
      {insight.action && (
        <div className={`mt-2 text-[11px] font-semibold ${s.title} cursor-pointer`}>→ {insight.action}</div>
      )}
    </div>
  );
}

interface Props {
  data: InsightsResponse | null;
  onGenerate: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export default function InsightsPanel({ data, onGenerate, loading, error }: Props) {
  const insights = data?.ai_insights?.insights ?? data?.rule_insights ?? [];

  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest">Insights</div>
        {!data?.has_ai && (
          <button onClick={onGenerate} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold bg-[#2d1f5e] border border-[#4c1d95] text-[#a78bfa] hover:bg-[#3d2f6e] disabled:opacity-50">
            {loading ? '...' : '✦ Analyse with Claude'}
          </button>
        )}
        {data?.has_ai && (
          <span className="text-[10px] text-[#64748b] italic">AI · cached</span>
        )}
      </div>
      {error && (
        <div className="bg-[#1c0a0a] border border-[#7f1d1d] border-l-[3px] border-l-[#ef4444] rounded-lg p-3.5 mb-2.5">
          <div className="text-xs font-semibold text-[#f87171] mb-1">Could not generate insights</div>
          <div className="text-xs text-[#94a3b8]">{error}</div>
        </div>
      )}
      {insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}
      {insights.length === 0 && !error && (
        <div className="text-xs text-[#475569] text-center py-4">No insights yet</div>
      )}
    </div>
  );
}
