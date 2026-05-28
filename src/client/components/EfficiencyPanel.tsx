import type { KpiData } from '../types.js';

interface Props { current: KpiData; previous?: KpiData; }

function Metric({ label, value, prevValue }: {
  label: string; value: string; prevValue?: string; higherIsBetter?: boolean;
}) {
  return (
    <div className="bg-[#13151f] rounded-lg p-3.5">
      <div className="text-[10px] text-[#64748b] mb-1.5">{label}</div>
      <div className="text-lg font-bold text-[#a78bfa] mb-1">{value}</div>
      {prevValue && (
        <div className="text-[10px] text-[#475569]">prev: {prevValue}</div>
      )}
    </div>
  );
}

export default function EfficiencyPanel({ current, previous }: Props) {
  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest mb-4">Efficiency</div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Cache Hit Rate"
          value={`${Math.round(current.cache_hit_rate * 100)}%`}
          prevValue={previous ? `${Math.round(previous.cache_hit_rate * 100)}%` : undefined}
          higherIsBetter={true} />
        <Metric label="Opus Usage"
          value={`${Math.round(current.opus_pct * 100)}%`}
          prevValue={previous ? `${Math.round(previous.opus_pct * 100)}%` : undefined}
          higherIsBetter={false} />
        <Metric label="Cost per Session"
          value={`$${current.total_sessions > 0 ? (current.total_cost / current.total_sessions).toFixed(2) : '0.00'}`}
          prevValue={previous && previous.total_sessions > 0 ? `$${(previous.total_cost / previous.total_sessions).toFixed(2)}` : undefined} />
        <Metric label="Calls per Session"
          value={`${current.total_sessions > 0 ? Math.round(current.total_calls / current.total_sessions) : 0}`}
          prevValue={previous && previous.total_sessions > 0 ? `${Math.round(previous.total_calls / previous.total_sessions)}` : undefined} />
      </div>
    </div>
  );
}
