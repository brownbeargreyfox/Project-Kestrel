// src/plugins/aida/views/MAIAMemoryPanel.tsx
//
// Read-only MAIA memory browser for the AIDA Sentinel "Memory" pillar.
// Fetches deterministic coverage, insights, and memory nodes from /api/maia and
// renders them with full provenance. MAIA interprets memory — it never acts,
// simulates, or calls any model/broker/provider. No auto-refresh loops.

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Brain, RefreshCw, Search } from 'lucide-react';
import type {
  MAIACoverageSummary,
  MAIAInsight,
  MAIAMemoryKind,
  MAIAMemoryNode,
} from '../../../types/maia';
import { InsightCard, MemoryCard } from './MAIAMemoryCards';

const KIND_OPTIONS: { value: MAIAMemoryKind | ''; label: string }[] = [
  { value: '', label: 'All kinds' },
  { value: 'aida.recommendation.accepted', label: 'Accepted' },
  { value: 'aida.recommendation.dismissed', label: 'Dismissed' },
  { value: 'aida.simulation.run', label: 'Simulation' },
  { value: 'aida.observation.insight', label: 'Observation' },
  { value: 'operator.note', label: 'Operator note' },
  { value: 'maia.correction', label: 'Correction' },
];

export default function MAIAMemoryPanel() {
  const [coverage, setCoverage] = useState<MAIACoverageSummary | null>(null);
  const [insights, setInsights] = useState<MAIAInsight[]>([]);
  const [nodes, setNodes] = useState<MAIAMemoryNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qDraft, setQDraft] = useState('');
  const [kindDraft, setKindDraft] = useState<MAIAMemoryKind | ''>('');

  const load = useCallback(async (q: string, kind: MAIAMemoryKind | '') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (kind) params.set('kind', kind);
      const suffix = params.toString() ? `?${params}` : '';
      const [covRes, insRes, memRes] = await Promise.all([
        fetch(`/api/maia/coverage${suffix}`),
        fetch(`/api/maia/insights${suffix}`),
        fetch(`/api/maia/memory${suffix}`),
      ]);
      const cov = await covRes.json();
      const ins = await insRes.json();
      const mem = await memRes.json();
      if (!covRes.ok || !cov.ok) throw new Error(cov.error || 'Failed to load coverage');
      if (!insRes.ok || !ins.ok) throw new Error(ins.error || 'Failed to load insights');
      if (!memRes.ok || !mem.ok) throw new Error(mem.error || 'Failed to load memory');
      setCoverage(cov.coverage ?? null);
      setInsights(Array.isArray(ins.insights) ? ins.insights : []);
      setNodes(Array.isArray(mem.nodes) ? mem.nodes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MAIA memory');
    } finally {
      setLoading(false);
    }
  }, []);

  // One initial load; thereafter only on explicit submit/refresh (no auto-loop).
  useEffect(() => {
    load('', '');
  }, [load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    load(qDraft, kindDraft);
  };

  const isEmpty = !loading && !error && nodes.length === 0 && insights.length === 0;

  return (
    <section
      className="rounded-xl border border-sky-900/50 bg-sky-950/10 p-4"
      data-testid="maia-memory-panel"
      aria-label="MAIA durable memory"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sky-100">
            <Brain size={17} className="text-sky-300" /> MAIA Memory
            <span className="rounded-full border border-sky-900 bg-sky-950/60 px-2 py-0.5 text-[11px] text-sky-200">
              durable · append-only
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-300">MAIA remembers so you decide better.</p>
          <p className="text-xs text-neutral-500">Interpretation, not automation.</p>
        </div>
        <button
          type="button"
          onClick={() => load(qDraft, kindDraft)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          data-testid="maia-memory-refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
          Refresh
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-xs text-neutral-400">
          <span className="mb-1 block">Search memory</span>
          <span className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5">
            <Search size={14} className="text-neutral-500" />
            <input
              type="text"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="asset name, action, tag…"
              className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none"
              data-testid="maia-memory-search"
            />
          </span>
        </label>
        <label className="text-xs text-neutral-400">
          <span className="mb-1 block">Kind</span>
          <select
            value={kindDraft}
            onChange={(e) => setKindDraft(e.target.value as MAIAMemoryKind | '')}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-neutral-100"
            data-testid="maia-memory-kind"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-sky-800 bg-sky-950/50 px-3 py-2 text-sm text-sky-200 hover:bg-sky-900/50 disabled:opacity-50"
        >
          Search
        </button>
      </form>

      {/* Coverage summary */}
      {coverage && (
        <div
          className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400"
          data-testid="maia-memory-coverage"
        >
          <span className="text-neutral-300">{coverage.totalNodes}</span> memory node(s) ·{' '}
          <span className="text-neutral-300">{coverage.assetsCovered}</span> asset(s) covered
          {coverage.newest && <> · newest {new Date(coverage.newest).toLocaleString()}</>}
          {coverage.lowCoverage && (
            <div className="mt-1 flex items-start gap-1.5 text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{coverage.warnings.join(' ') || 'Low historical coverage.'}</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200"
          role="alert"
          data-testid="maia-memory-error"
        >
          <div>{error}</div>
          <button
            type="button"
            onClick={() => load(qDraft, kindDraft)}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          Reading durable memory…
        </div>
      )}

      {/* Empty */}
      {isEmpty && (
        <div
          className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400"
          data-testid="maia-memory-empty"
        >
          No durable memory yet. Accept or dismiss a recommendation, or run a simulation, and MAIA
          will record it here.
        </div>
      )}

      {/* Insights */}
      {!loading && !error && insights.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Insights</div>
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {/* Memory nodes */}
      {!loading && !error && nodes.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Memory nodes
          </div>
          {nodes.map((node) => (
            <MemoryCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </section>
  );
}
