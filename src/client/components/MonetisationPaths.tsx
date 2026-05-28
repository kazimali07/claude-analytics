interface MonoPath {
  title: string;
  subtitle: string;
  body: string;
  revenueRange: string;
  revenueSub: string;
  effort: number;
  effortLabel: string;
  isBestBet?: boolean;
}

interface Props { paths: MonoPath[]; loading: boolean; onGenerate: () => void; hasAi: boolean; }

export default function MonetisationPaths({ paths, loading, onGenerate, hasAi }: Props) {
  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest">Monetisation Paths</div>
        {!hasAi && (
          <button onClick={onGenerate} disabled={loading}
            className="text-[11px] font-semibold px-3 py-1 rounded-lg bg-[#2d1f5e] border border-[#4c1d95] text-[#a78bfa] hover:bg-[#3d2f6e] disabled:opacity-50">
            {loading ? '...' : '✦ Generate with AI'}
          </button>
        )}
      </div>
      {paths.length === 0 && !loading && (
        <div className="text-xs text-[#475569] text-center py-6">
          Click "Generate with AI" to get monetisation recommendations for this project.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {paths.map((p, i) => (
          <div key={i} className={`rounded-lg p-4 border ${p.isBestBet ? 'border-[#7c3aed] bg-[#150d2e]' : 'border-[#2d3148] bg-[#13151f]'}`}>
            <div className="text-sm font-semibold text-[#e2e8f0] mb-1">
              {p.title}
              {p.isBestBet && <span className="ml-2 text-[10px] bg-[#4c1d95] text-[#c4b5fd] px-2 py-0.5 rounded">Best bet</span>}
            </div>
            <div className="text-[11px] text-[#64748b] mb-2">{p.subtitle}</div>
            <div className="text-xs text-[#94a3b8] leading-relaxed mb-3">{p.body}</div>
            <div className="text-lg font-bold text-[#a78bfa]">{p.revenueRange}</div>
            <div className="text-[10px] text-[#64748b] mb-2">{p.revenueSub}</div>
            <div className="flex gap-1 mb-1">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className={`flex-1 h-1 rounded-sm ${j < p.effort ? 'bg-[#7c3aed]' : 'bg-[#2d3148]'}`} />
              ))}
            </div>
            <div className="text-[10px] text-[#64748b]">{p.effortLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
