// src/plugins/aida/views/InfrastructureTab.tsx
// AIDA plugin · Observation surface — compact at-risk panel.

import React from 'react';

type Signal = { key: string; label: string };
type Asset = {
  id: string; name: string; type: string; status: string;
  risk: number; datacenterName?: string; tier?: string;
  incident?: { type: string } | null; signals?: Signal[];
};
type Observation = {
  assetCount: number; atRiskCount: number;
  systemHealth: { healthyPct: number; warningPct: number; criticalPct: number; avgRisk: number };
  atRisk: Asset[];
};

const STATUS_DOT: Record<string, string> = {
  online: 'bg-emerald-400', warning: 'bg-amber-400',
  critical: 'bg-red-500', offline: 'bg-red-600', maintenance: 'bg-sky-400',
};

const InfrastructureTab: React.FC = () => {
  const [obs, setObs] = React.useState<Observation | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/aida/observe');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load observation');
      setObs(data.observation as Observation);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load observation');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const h = obs?.systemHealth;

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 p-4 text-neutral-100">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">AIDA · Infrastructure Observation</h3>
        <button onClick={load} disabled={loading}
          className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="mb-3 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200">{error}</div>}

      {h && (
        <div className="mb-3 grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Healthy',  value: `${h.healthyPct}%`,                          tone: 'text-emerald-300' },
            { label: 'Warning',  value: `${h.warningPct}%`,                          tone: 'text-amber-300'  },
            { label: 'Critical', value: `${h.criticalPct}%`,                         tone: 'text-red-300'    },
            { label: 'Avg risk', value: `${Math.round((h.avgRisk || 0) * 100)}%`,    tone: 'text-sky-300'    },
          ].map(({ label, value, tone }) => (
            <div key={label} className="rounded border border-neutral-800 bg-neutral-900 p-2">
              <div className={`text-base font-semibold ${tone}`}>{value}</div>
              <div className="text-[11px] text-neutral-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-1 text-xs text-neutral-500">
        {obs ? `${obs.atRiskCount} of ${obs.assetCount} assets at risk` : 'Loading…'}
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-auto">
        {(obs?.atRisk ?? []).map((a) => (
          <div key={a.id} className="rounded border border-neutral-800 bg-neutral-900 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status] || 'bg-neutral-500'}`} />
                <span className="truncate text-sm font-medium">{a.name}</span>
                <span className="font-mono text-[11px] text-neutral-500">{a.type}</span>
              </div>
              <span className="font-mono text-xs text-neutral-300">{Math.round(a.risk * 100)}%</span>
            </div>
            {a.incident && <div className="mt-0.5 text-[11px] text-amber-300/90">incident: {a.incident.type}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export default InfrastructureTab;
