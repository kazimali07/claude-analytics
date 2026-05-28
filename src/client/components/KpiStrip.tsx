import type { KpiData } from '../types.js';

interface Props {
  current: KpiData;
  previous?: KpiData;
}

interface KpiCardProps {
  label: string;
  value: string;
  prev?: string;
  delta?: string;
  deltaGood?: boolean;
}

function KpiCard({ label, value, prev, delta, deltaGood }: KpiCardProps) {
  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-4">
      <div className="text-[10px] text-[#64748b] uppercase tracking-widest mb-2">{label}</div>
      <div className="text-2xl font-bold text-[#f1f5f9]">{value}</div>
      {prev && delta && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[11px] text-[#475569]">{prev}</span>
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${deltaGood ? 'bg-[#052e16] text-[#34d399]' : 'bg-[#450a0a] text-[#f87171]'}`}>
            {delta}
          </span>
        </div>
      )}
    </div>
  );
}

function pct(v: number) { return `${Math.round(v * 100)}%`; }
function cost(v: number) { return `$${v.toFixed(2)}`; }
function delta(curr: number, prev: number, _higherIsBad = false): { text: string; good: boolean } {
  if (prev === 0) return { text: '—', good: true };
  const d = (curr - prev) / prev;
  const text = `${d >= 0 ? '+' : ''}${Math.round(d * 100)}%`;
  const good = _higherIsBad ? d < 0 : d > 0;
  return { text, good };
}

export default function KpiStrip({ current, previous }: Props) {
  const costDelta = previous ? delta(current.total_cost, previous.total_cost, true) : null;
  const callsDelta = previous ? delta(current.total_calls, previous.total_calls, false) : null;
  const cacheDelta = previous ? delta(current.cache_hit_rate, previous.cache_hit_rate, false) : null;
  const opusDelta = previous ? delta(current.opus_pct, previous.opus_pct, true) : null;

  return (
    <div className="grid grid-cols-5 gap-3.5 mb-6">
      <KpiCard label="Total Cost" value={cost(current.total_cost)}
        prev={previous ? cost(previous.total_cost) : undefined}
        delta={costDelta?.text} deltaGood={costDelta?.good} />
      <KpiCard label="API Calls" value={current.total_calls.toLocaleString()}
        prev={previous ? previous.total_calls.toLocaleString() : undefined}
        delta={callsDelta?.text} deltaGood={callsDelta?.good} />
      <KpiCard label="Sessions" value={current.total_sessions.toLocaleString()} />
      <KpiCard label="Cache Hit Rate" value={pct(current.cache_hit_rate)}
        prev={previous ? pct(previous.cache_hit_rate) : undefined}
        delta={cacheDelta ? (cacheDelta.text.replace('%', 'pp')) : undefined}
        deltaGood={cacheDelta?.good} />
      <KpiCard label="Opus Usage" value={pct(current.opus_pct)}
        prev={previous ? pct(previous.opus_pct) : undefined}
        delta={opusDelta ? opusDelta.text.replace('%', 'pp') : undefined}
        deltaGood={opusDelta?.good} />
    </div>
  );
}
