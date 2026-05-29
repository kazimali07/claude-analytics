import { useState, useEffect, useCallback } from 'react';
import FilterBar, { type FilterState } from '../components/FilterBar.js';
import KpiStrip from '../components/KpiStrip.js';
import TrendChart from '../components/TrendChart.js';
import ProjectBars from '../components/ProjectBars.js';
import ModelMix from '../components/ModelMix.js';
import EfficiencyPanel from '../components/EfficiencyPanel.js';
import InsightsPanel from '../components/InsightsPanel.js';
import { api } from '../api.js';
import type { KpiData, TrendPoint, ProjectSummary, ModelMixItem, InsightsResponse } from '../types.js';

const today = new Date().toISOString().slice(0, 10);
const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

const DEFAULT_FILTER: FilterState = {
  from: ninetyDaysAgo, to: today,
  compareEnabled: false,
  compareFrom: new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10),
  compareTo: ninetyDaysAgo,
};

interface Props { onSelectProject: (name: string) => void; }

export default function Dashboard({ onSelectProject }: Props) {
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [compareKpis, setCompareKpis] = useState<KpiData | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [compareTrend, setCompareTrend] = useState<TrendPoint[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [compareProjects, setCompareProjects] = useState<ProjectSummary[]>([]);
  const [modelMix, setModelMix] = useState<ModelMixItem[]>([]);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = { from: filter.from, to: filter.to };
    const [ov, proj, ins] = await Promise.all([
      api.overview(params),
      api.projects(params),
      api.insights('overview', params),
    ]);
    setKpis(ov.kpis);
    setTrend(ov.trend);
    setModelMix(ov.modelMix);
    setProjects(proj.projects);
    setInsights(ins);

    if (filter.compareEnabled) {
      const cp = { from: filter.compareFrom, to: filter.compareTo };
      const [cov, cproj] = await Promise.all([api.overview(cp), api.projects(cp)]);
      setCompareKpis(cov.kpis);
      setCompareTrend(cov.trend);
      setCompareProjects(cproj.projects);
    } else {
      setCompareKpis(null);
      setCompareTrend([]);
      setCompareProjects([]);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  async function handleGenerateInsights() {
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      await api.generateInsights('overview', { stats: kpis, stats_hash: insights?.stats_hash });
      const fresh = await api.insights('overview', { from: filter.from, to: filter.to });
      setInsights(fresh);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInsightsError(
        msg.includes('403')
          ? 'No ANTHROPIC_API_KEY configured. Set it in your environment to enable AI insights.'
          : `Failed to generate insights: ${msg}`
      );
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* Header */}
      <div className="bg-[#1a1d27] border-b border-[#2d3148] px-7 py-3.5 flex items-center justify-between">
        <div className="text-base font-semibold text-[#a78bfa]">⬡ Claude Analytics</div>
        <button onClick={async () => { await api.rescan(); void load(); }} className="text-xs bg-[#2d3148] border border-[#3d4268] text-[#94a3b8] px-3.5 py-1.5 rounded-lg hover:bg-[#3d4268]">
          ↻ Rescan
        </button>
      </div>

      <FilterBar value={filter} onChange={setFilter} />

      <div className="max-w-[1280px] mx-auto px-7 py-6">
        {kpis && <KpiStrip current={kpis} previous={compareKpis ?? undefined} />}

        <TrendChart data={trend} compareData={filter.compareEnabled ? compareTrend : undefined} />

        <div className="grid grid-cols-[2fr_1fr] gap-4 mb-4">
          <ProjectBars projects={projects} compareProjects={filter.compareEnabled ? compareProjects : undefined} onSelect={onSelectProject} />
          <ModelMix data={modelMix} />
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-4">
          {kpis && <EfficiencyPanel current={kpis} previous={compareKpis ?? undefined} />}
          <InsightsPanel data={insights} onGenerate={handleGenerateInsights} loading={insightsLoading} error={insightsError} />
        </div>
      </div>
    </div>
  );
}
