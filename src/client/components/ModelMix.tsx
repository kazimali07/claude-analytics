import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { ModelMixItem } from '../types.js';

const COLORS: Record<string, string> = {
  opus: '#7c3aed',
  sonnet: '#3b82f6',
  haiku: '#10b981',
  other: '#64748b',
};

interface Props { data: ModelMixItem[]; }

export default function ModelMix({ data }: Props) {
  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest mb-4">Model Mix</div>
      <ResponsiveContainer width="100%" height={120}>
        <PieChart>
          <Pie data={data} dataKey="count" innerRadius={35} outerRadius={55} paddingAngle={2}>
            {data.map(d => <Cell key={d.model_family} fill={COLORS[d.model_family] ?? '#64748b'} />)}
          </Pie>
          <Tooltip formatter={(v, n) => [`${v} calls`, n]}
            contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5 mt-2">
        {data.map(d => (
          <div key={d.model_family} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[d.model_family] ?? '#64748b' }} />
            <span className="text-xs text-[#e2e8f0] flex-1">{d.model_family}</span>
            <div className="w-16 h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${d.pct * 100}%`, background: COLORS[d.model_family] ?? '#64748b' }} />
            </div>
            <span className="text-xs text-[#64748b] w-8 text-right">{Math.round(d.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
