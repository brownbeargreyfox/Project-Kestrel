// src/plugins/aida/views/ManualAssetMemoryContext.jsx
//
// Read-only MAIA context for local manual AIDA assets. Kept inside the AIDA
// plugin to avoid importing OS app components across layers.

import React from 'react';
import { AlertTriangle, Brain, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

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

function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export default function ManualAssetMemoryContext({ assetId, assetName }) {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [insights, setInsights] = React.useState([]);
  const [nodes, setNodes] = React.useState([]);

  const load = React.useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `?assetId=${encodeURIComponent(assetId)}`;
      const [insRes, memRes] = await Promise.all([
        fetch(`/api/maia/insights${qs}`),
        fetch(`/api/maia/memory${qs}&limit=5`),
      ]);
      const ins = await insRes.json();
      const mem = await memRes.json();
      if (!insRes.ok || !ins.ok) throw new Error(ins.error || 'Failed to load MAIA insights');
      if (!memRes.ok || !mem.ok) throw new Error(mem.error || 'Failed to load MAIA memory');
      setInsights(Array.isArray(ins.insights) ? ins.insights : []);
      setNodes(Array.isArray(mem.nodes) ? mem.nodes : []);
      setLoaded(true);
    } catch (err) {
      setError(err?.message ?? 'Failed to load MAIA context');
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) load();
  };

  if (!assetId) return null;

  const topInsight = insights[0] || null;
  const isEmpty = loaded && insights.length === 0 && nodes.length === 0;

  return (
    <div className="mt-3 border-t border-neutral-800 pt-3" data-testid="manual-asset-maia-context">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-900 bg-sky-950/30 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-900/40"
        data-testid="manual-asset-maia-toggle"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Brain size={13} /> MAIA memory
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-neutral-500">
              Interpretation, not automation · {assetName || assetId}
            </span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
              Refresh
            </button>
          </div>

          {loading && <div className="text-xs text-neutral-400">Reading durable memory…</div>}

          {error && (
            <div className="rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200" role="alert">
              <div>{error}</div>
              <button
                type="button"
                onClick={load}
                className="mt-1 inline-flex items-center gap-1 rounded border border-red-700 bg-red-950/70 px-2 py-0.5 text-[11px] text-red-100 hover:bg-red-900"
              >
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}

          {isEmpty && !loading && !error && (
            <div className="text-xs text-neutral-500">No prior MAIA memory recorded for this asset yet.</div>
          )}

          {!loading && !error && topInsight && (
            <div className="mb-2 rounded border border-neutral-800 bg-neutral-900 p-2">
              <div className="text-xs text-neutral-200">{topInsight.summary}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                <span>Relevance {pct(topInsight.relevanceScore)}</span>
                <span>Confidence {pct(topInsight.confidence?.value)}</span>
                <span>Source memory: {topInsight.memoryNodes?.length ?? 0}</span>
              </div>
              {topInsight.coverageWarnings?.length > 0 && (
                <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-300">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <span>{topInsight.coverageWarnings.join(' ')}</span>
                </div>
              )}
            </div>
          )}

          {!loading && !error && nodes.length > 0 && (
            <ul className="space-y-1">
              {nodes.map((node) => (
                <li
                  key={node.id}
                  className="rounded border border-neutral-800/70 bg-neutral-900/70 px-2 py-1 text-[11px] text-neutral-400"
                  data-testid="manual-asset-maia-node"
                >
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                    {KIND_LABELS[node.kind] || node.kind}
                  </span>{' '}
                  <span className="text-neutral-300">{node.summary}</span>
                  <span className="ml-1 text-neutral-600">· {formatDate(node.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
