// src/plugins/aida/views/SimulationPlannerWidget.tsx
// AIDA plugin · Simulation pillar — "Model before meddle."
// What-if cascade projector: pick an asset, see blast radius + health delta.
// Pure projection; no writes anywhere.

import React from 'react';

type Dependent = { id: string; name: string; tier: string };
type Asset = {
  id: string; name: string; type: string; tier?: string;
  status: string; risk: number; datacenter?: string;
};
type Observation = {
  assetCount: number;
  systemHealth: { criticalPct: number };
  assets: Asset[];
  atRisk: Asset[];
};

const TIER_ORDER = ['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid'];

const SimulationPlannerWidget: React.FC = () => {
  const [obs, setObs] = React.useState<Observation | null>(null);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/aida/observe');
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load observation');
        setObs(data.observation as Observation);
        const seed = data.observation?.atRisk?.[0]?.id || data.observation?.assets?.[0]?.id || '';
        setSelectedId(seed);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load');
      }
    })();
  }, []);

  const selected = obs?.assets.find((a) => a.id === selectedId) || null;

  const projection = React.useMemo(() => {
    if (!obs || !selected) return null;
    const tierIdx = TIER_ORDER.indexOf(selected.tier || '');
    const dependents: Dependent[] =
      tierIdx < 0
        ? []
        : obs.assets
            .filter(
              (o) =>
                o.id !== selected.id &&
                o.datacenter === selected.datacenter &&
                TIER_ORDER.indexOf(o.tier || '') >= 0 &&
                TIER_ORDER.indexOf(o.tier || '') < tierIdx,
            )
            .map((o) => ({ id: o.id, name: o.name, tier: o.tier || '' }));

    const projectedCriticalPct =
      obs.assetCount > 0
        ? Number(
            ((obs.systemHealth.criticalPct / 100) * obs.assetCount + 1 + dependents.length) /
              obs.assetCount *
              100,
          ).toFixed(1)
        : '0.0';

    return { dependents, projectedCriticalPct };
  }, [obs, selected]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 p-4 text-neutral-100">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">AIDA · Simulation Planner</h3>
        <span className="rounded-full border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-[10px] text-amber-200/90">
          model before meddle · no changes made
        </span>
      </div>

      {error && <div className="mb-2 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}

      <label className="mb-1 text-xs text-neutral-400">Asset to model</label>
      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        className="mb-3 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
      >
        {(obs?.assets ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.type}) · risk {Math.round(a.risk * 100)}%
          </option>
        ))}
      </select>

      {selected && projection && (
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div className="font-medium">If <span className="text-sky-300">{selected.name}</span> failed…</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-lg font-semibold text-orange-300">{projection.dependents.length}</div>
                <div className="text-neutral-500">dependent assets at risk</div>
              </div>
              <div className="rounded border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-lg font-semibold text-red-300">{projection.projectedCriticalPct}%</div>
                <div className="text-neutral-500">projected critical share</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="mb-2 text-xs font-medium text-neutral-300">Projected blast radius</div>
            {projection.dependents.length === 0 ? (
              <div className="text-xs text-neutral-500">No downstream dependents modeled for this asset's tier.</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {projection.dependents.map((d) => (
                  <span key={d.id} className="rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[11px] text-neutral-400">
                    {d.name} <span className="text-neutral-600">({d.tier})</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-neutral-500">
            Cascade modeled along the datacenter tier stack (dmz → web → app → data). This is an explainable projection — AIDA recommends, it does not act.
          </p>
        </div>
      )}
    </div>
  );
};

export default SimulationPlannerWidget;
