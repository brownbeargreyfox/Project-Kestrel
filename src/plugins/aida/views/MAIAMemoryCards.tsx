// src/plugins/aida/views/MAIAMemoryCards.tsx
//
// Presentational cards for the MAIA memory browser. Display-only: no fetch, no
// state, no actions. Every insight card surfaces Relevance, Confidence, Source
// memory, and any Coverage warning so provenance is always visible.

import { AlertTriangle, Brain, GitBranch, Layers } from 'lucide-react';
import type { MAIAInsight, MAIAMemoryNode } from '../../../types/maia';

const KIND_LABELS: Record<string, string> = {
  'aida.recommendation.accepted': 'Accepted',
  'aida.recommendation.dismissed': 'Dismissed',
  'aida.simulation.run': 'Simulation',
  'aida.observation.insight': 'Observation',
  'operator.note': 'Operator note',
  'maia.correction': 'Correction',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function pct(value: number) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

export function InsightCard({ insight }: { insight: MAIAInsight }) {
  return (
    <article
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
      data-testid="maia-memory-insight"
    >
      <div className="flex items-start gap-2">
        <Brain size={15} className="mt-0.5 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-100">{insight.summary}</div>
          <p className="mt-1 text-xs text-neutral-400">{insight.whyItMatters}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
          <div className="text-neutral-500">Relevance</div>
          <div className="font-mono text-neutral-200">{pct(insight.relevanceScore)}</div>
        </div>
        <div className="rounded border border-neutral-800 bg-neutral-900 p-2">
          <div className="text-neutral-500">Confidence</div>
          <div className="font-mono text-neutral-200">{pct(insight.confidence.value)}</div>
          <div className="mt-0.5 text-[11px] text-neutral-500">{insight.confidence.basis}</div>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-400">
          <GitBranch size={12} /> Source memory ({insight.memoryNodes.length})
        </div>
        <ul className="mt-1 space-y-1">
          {insight.memoryNodes.map((node) => (
            <li
              key={node.id}
              className="rounded border border-neutral-800/70 bg-neutral-900/70 px-2 py-1 text-[11px] text-neutral-400"
            >
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300">
                {KIND_LABELS[node.kind] || node.kind}
              </span>{' '}
              <span className="text-neutral-300">{node.summary}</span>
              <span className="ml-1 font-mono text-neutral-600">· {node.id.slice(0, 12)}</span>
            </li>
          ))}
        </ul>
      </div>

      {insight.coverageWarnings.length > 0 && (
        <div className="mt-2 space-y-1">
          {insight.coverageWarnings.map((warning) => (
            <div
              key={warning}
              className="flex items-start gap-1.5 rounded border border-amber-900/60 bg-amber-950/30 px-2 py-1 text-[11px] text-amber-200"
            >
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>Coverage warning: {warning}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function MemoryCard({ node }: { node: MAIAMemoryNode }) {
  const prov = node.provenance || {};
  return (
    <article
      className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
      data-testid="maia-memory-node"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-neutral-100">{node.summary}</div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {node.assetName ? `${node.assetName} · ` : ''}
            {formatDate(node.ts)}
            {node.revisionOf ? ' · revises a prior node' : ''}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-300">
          {KIND_LABELS[node.kind] || node.kind}
        </span>
      </div>

      {node.detail && <p className="mt-1.5 text-xs text-neutral-400">{node.detail}</p>}

      {node.tags?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.tags.map((tag) => (
            <span key={tag} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
        <span className="inline-flex items-center gap-1">
          <Layers size={11} /> confidence {pct(node.confidence?.value ?? 0)}
        </span>
        {prov.actor && <span>actor: {prov.actor}</span>}
        {prov.sourceEventType && <span className="font-mono">{prov.sourceEventType}</span>}
        {prov.recommendationId && (
          <span className="font-mono">rec {prov.recommendationId.slice(0, 8)}</span>
        )}
        {prov.simulationId && <span className="font-mono">sim {prov.simulationId.slice(0, 8)}</span>}
      </div>
      {node.confidence?.lowCoverage && (
        <div className="mt-1 text-[11px] text-amber-300/90">⚠ {node.confidence.basis}</div>
      )}
    </article>
  );
}
