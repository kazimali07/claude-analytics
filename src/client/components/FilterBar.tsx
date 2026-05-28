


export interface FilterState {
  from: string;
  to: string;
  compareEnabled: boolean;
  compareFrom: string;
  compareTo: string;
}

interface Props {
  value: FilterState;
  onChange: (f: FilterState) => void;
}

const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 0 },
];

function daysAgo(d: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}

function prevMonth(isoDate: string): { from: string; to: string } {
  const d = new Date(isoDate);
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().slice(0, 10);
  return { from, to };
}

export default function FilterBar({ value, onChange }: Props) {
  const today = new Date().toISOString().slice(0, 10);

  function applyPreset(days: number) {
    const from = days === 0 ? '2020-01-01' : daysAgo(days);
    const prev = prevMonth(from);
    onChange({ ...value, from, to: today, compareFrom: prev.from, compareTo: prev.to });
  }

  return (
    <div className="bg-[#13151f] border-b border-[#2d3148] px-7 py-2.5 flex items-center gap-4 flex-wrap text-sm">
      <span className="text-[#475569] uppercase tracking-widest text-[10px]">Range</span>
      <div className="flex gap-1">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.days)}
            className="px-3 py-1 rounded-md border text-xs border-[#3d4268] bg-[#2d3148] text-[#94a3b8] hover:bg-[#3d4268]"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date" value={value.from}
          onChange={e => onChange({ ...value, from: e.target.value })}
          className="bg-[#2d3148] border border-[#3d4268] text-[#e2e8f0] text-xs rounded px-2 py-1"
        />
        <span className="text-[#475569]">→</span>
        <input
          type="date" value={value.to}
          onChange={e => onChange({ ...value, to: e.target.value })}
          className="bg-[#2d3148] border border-[#3d4268] text-[#e2e8f0] text-xs rounded px-2 py-1"
        />
      </div>
      <div className="w-px h-5 bg-[#2d3148]" />
      <span className="text-[#475569] uppercase tracking-widest text-[10px]">Compare</span>
      <button
        onClick={() => onChange({ ...value, compareEnabled: !value.compareEnabled })}
        className={`w-9 h-5 rounded-full relative transition-colors ${value.compareEnabled ? 'bg-[#7c3aed]' : 'bg-[#2d3148]'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${value.compareEnabled ? 'right-0.5' : 'left-0.5'}`} />
      </button>
      {value.compareEnabled && (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#4c1d95] text-[#c4b5fd] border border-[#7c3aed]">
            {value.from.slice(0, 7)}
          </span>
          <span className="text-[#475569] text-xs">vs</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#1e3a5f] text-[#7dd3fc] border border-[#2563eb]">
            {value.compareFrom.slice(0, 7)}
          </span>
        </div>
      )}
    </div>
  );
}
