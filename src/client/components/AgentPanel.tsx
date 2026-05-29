interface Props {
  projectName: string;
  assessment: string | null;
  loading: boolean;
  onAsk: (question: string) => void;
  error?: string | null;
}

const CTAS = [
  'What should I build next?',
  'Show monetisation path',
  'Token optimisation tips',
  'Estimate App Store readiness',
];

export default function AgentPanel({ projectName, assessment, loading, onAsk, error }: Props) {
  return (
    <div className="bg-[#13151f] border border-[#2d3148] rounded-xl overflow-hidden mb-4">
      <div className="bg-[#1e1a2e] px-[1.125rem] py-3.5 flex items-center gap-2.5 border-b border-[#2d3148]">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] flex items-center justify-center text-sm">✦</div>
        <div>
          <div className="text-sm font-semibold text-[#a78bfa]">Second Brain — {projectName}</div>
          <div className="text-[11px] text-[#64748b]">AI project assessment</div>
        </div>
        <span className="ml-auto text-[10px] text-[#64748b] border border-[#4c1d95] bg-[#1e1230] px-2 py-0.5 rounded text-[#a78bfa]">✦ AI</span>
      </div>
      <div className="px-[1.125rem] py-4 border-b border-[#1e2235]">
        <div className="text-[10px] text-[#475569] uppercase tracking-widest mb-2">Assessment</div>
        {loading && <div className="text-sm text-[#64748b] italic">Analysing...</div>}
        {!loading && error && (
          <div className="text-xs text-[#f87171]">{error}</div>
        )}
        {!loading && !error && assessment && (
          <div className="text-[13px] text-[#cbd5e1] leading-relaxed" dangerouslySetInnerHTML={{ __html: assessment }} />
        )}
        {!loading && !error && !assessment && (
          <div className="text-xs text-[#475569]">Click a question below to generate an AI assessment.</div>
        )}
      </div>
      <div className="px-[1.125rem] py-3 flex flex-wrap gap-2">
        {CTAS.map(q => (
          <button key={q} onClick={() => onAsk(q)}
            className="bg-[#2d3148] border border-[#3d4268] text-[#94a3b8] text-xs px-3.5 py-1.5 rounded-lg hover:bg-[#3d4268] first:bg-[#4c1d95] first:border-[#7c3aed] first:text-[#c4b5fd]">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
