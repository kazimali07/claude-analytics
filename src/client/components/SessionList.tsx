import type { SessionRow } from '../types.js';

interface Props { sessions: SessionRow[]; maxCalls?: number; }

const MODEL_BADGE: Record<string, string> = {
  opus: 'bg-[#4c1d95] text-[#c4b5fd]',
  sonnet: 'bg-[#1e3a5f] text-[#7dd3fc]',
  haiku: 'bg-[#14532d] text-[#86efac]',
};

export default function SessionList({ sessions, maxCalls }: Props) {
  const max = maxCalls ?? Math.max(...sessions.map(s => s.message_count), 1);

  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest mb-4">Sessions</div>
      <div className="space-y-0">
        {sessions.map(s => (
          <div key={s.session_id} className="flex items-center gap-3 py-2.5 border-b border-[#1e2235] last:border-0">
            <div className="text-[11px] text-[#475569] w-16 flex-shrink-0">
              {new Date(s.started_at).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#7c3aed]"
                  style={{ width: `${(s.message_count / max) * 100}%` }} />
              </div>
            </div>
            <div className="text-[11px] text-[#64748b] w-16 text-right flex-shrink-0">
              {s.message_count} calls
            </div>
            <div className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${MODEL_BADGE[s.primary_model] ?? 'bg-[#2d3148] text-[#64748b]'}`}>
              {s.primary_model}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
