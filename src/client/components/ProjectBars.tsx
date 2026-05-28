import type { ProjectSummary } from '../types.js';

interface Props {
  projects: ProjectSummary[];
  compareProjects?: ProjectSummary[];
  onSelect?: (name: string) => void;
}

export default function ProjectBars({ projects, compareProjects, onSelect }: Props) {
  const maxCost = Math.max(...projects.map(p => p.cost), 0.01);

  return (
    <div className="bg-[#1a1d27] border border-[#2d3148] rounded-xl p-5">
      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-widest mb-4">Projects</div>
      <div className="space-y-2.5">
        {projects.map(p => {
          const prev = compareProjects?.find(c => c.project_name === p.project_name);
          return (
            <div key={p.project_name} className="flex items-center gap-2.5 group">
              <button
                onClick={() => onSelect?.(p.project_name)}
                className="text-xs text-[#e2e8f0] w-36 truncate text-left hover:text-[#a78bfa] transition-colors"
              >
                {p.project_name}
              </button>
              <div className="flex-1 flex flex-col gap-1">
                <div className="h-2 bg-[#2d3148] rounded-full overflow-hidden">
                  <div className="h-full bg-[#7c3aed] rounded-full transition-all"
                    style={{ width: `${(p.cost / maxCost) * 100}%` }} />
                </div>
                {prev && (
                  <div className="h-1.5 bg-[#2d3148] rounded-full overflow-hidden">
                    <div className="h-full bg-[#3b82f6] rounded-full opacity-60"
                      style={{ width: `${(prev.cost / maxCost) * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="text-xs text-[#64748b] w-14 text-right">${p.cost.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
