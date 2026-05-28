import { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TrendPoint } from '../types.js';

interface Props {
  data: TrendPoint[];
  compareData?: TrendPoint[];
}

type Metric = 'calls' | 'cost';

export default function TrendChart({ data, compareData }: Props) {
  const [metric, setMetric] = useState<Metric>('calls');

  const merged = data.map(d => ({
    date: d.date,
    current: d[metric],
    ...(compareData ? { compare: compareData.find(c => c.date.slice(8) === d.date.slice(8))?.[metric] ?? 0 } : {}),
  }));

  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-widest">
          Usage Over Time{compareData ? ' — Comparison' : ''}
        </h2>
        <div className="flex gap-1.5">
          {(['calls', 'cost'] as Metric[]).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-3 py-1 rounded-full text-[11px] border ${metric === m ? 'bg-[#4c1d95] border-[#7c3aed] text-[#c4b5fd]' : 'bg-[#2d3148] border-[#3d4268] text-[#94a3b8]'}`}>
              {m === 'calls' ? 'API Calls' : 'Cost ($)'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={merged}>
          <defs>
            <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradCompare" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false}
            tickFormatter={d => d.slice(5)} interval="preserveStartEnd" />
          <YAxis tick={{ fill: '#475569', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8' }} itemStyle={{ color: '#e2e8f0' }} />
          {compareData && <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />}
          <Area type="monotone" dataKey="current" name="Current" stroke="#a78bfa" fill="url(#gradCurrent)" strokeWidth={2} dot={false} />
          {compareData && <Area type="monotone" dataKey="compare" name="Previous" stroke="#3b82f6" fill="url(#gradCompare)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.7} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
