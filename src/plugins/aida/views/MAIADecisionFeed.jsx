// src/plugins/aida/views/MAIADecisionFeed.jsx
//
// Read-only durable decision ledger for the AIDA Reflect pillar. Where the local
// reflection log only holds this session's dismissals, this surfaces the durable
// MAIA record of operator decisions across the system (accepts, dismissals,
// approvals, manual-asset and network actions). Read-only; MAIA never acts.

import React from 'react';
import { Brain, RefreshCw } from 'lucide-react';

const KIND_LABELS = {
  'aida.recommendation.accepted': 'Accepted',
  'aida.recommendation.dismissed': 'Dismissed',
  'aida.simulation.run': 'Simulation',
  'aida.observation.insight': 'Observation',
  'operator.note': 'Operator note',
  'maia.correction': 'Correction',
};

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function MAIADecisionFeed({ limit = 15 }) {
  const [nodes, setNodes] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/maia/memory?limit=${encodeURIComponent(limit)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load durable decisions (HTTP ${res.status})`);
      setNodes(Array.isArray(data.nodes) ? data.nodes : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load durable decisions');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid="aida-reflect-maia-feed" aria-label="Durable decision ledger">
      <div className="mb-3 flex items-center gap-2 font-semibold">
        <Brain size={17} /> Durable decisions (MAIA)
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:opacity-50"
          data-testid="aida-reflect-maia-refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
          Refresh
        </button>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Append-only record that survives across sessions — MAIA remembers so you decide better.
      </p>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200" role="alert" data-testid="aida-reflect-maia-error">
          <div>{error}</div>
          <button
            type="button"
            onClick={load}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {!error && loading && nodes.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">Reading durable memory…</div>
      )}

      {!error && !loading && nodes.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400" data-testid="aida-reflect-maia-empty">
          No durable decisions yet. Accept/dismiss a recommendation, approve an intent, or label a device to record one.
        </div>
      )}

      {!error && nodes.length > 0 && (
        <ul className="space-y-2">
          {nodes.map((node) => (
            <li key={node.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm" data-testid="aida-reflect-maia-node">
              <div className="flex items-start justify-between gap-2">
                <span className="text-neutral-200">{node.summary}</span>
                <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300">
                  {KIND_LABELS[node.kind] || node.kind}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {node.assetName ? `${node.assetName} · ` : ''}{node.provenance?.actor ? `${node.provenance.actor} · ` : ''}{formatDate(node.ts)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
