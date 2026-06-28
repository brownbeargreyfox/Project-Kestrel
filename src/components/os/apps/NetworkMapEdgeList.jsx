// src/components/os/apps/NetworkMapEdgeList.jsx
// Flat sibling of NetworkMapApp: renders the manual-edge editor footer.
// Pure presentational component — all persistence stays in NetworkMapApp via
// Save Map. Field edits call onUpdateEdge against local state only (no POST).

import React from 'react';

const EDGE_KINDS = ['ethernet', 'wifi', 'logical', 'unknown'];
const EDGE_LABEL_MAX = 48;

export default function NetworkMapEdgeList({ edges, mapNodes, onDeleteEdge, onUpdateEdge }) {
  if (!edges || edges.length === 0) return null;

  return (
    <div className="max-h-48 overflow-y-auto border-t border-neutral-800 p-3" data-testid="network-map-edge-list">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Manual Edges ({edges.length})
      </div>
      <div className="flex flex-col gap-1">
        {edges.map((edge) => {
          const srcNode = mapNodes.find((n) => n.id === edge.sourceId);
          const tgtNode = mapNodes.find((n) => n.id === edge.targetId);
          const srcLabel = (srcNode?.label || edge.sourceId).slice(0, 24);
          const tgtLabel = (tgtNode?.label || edge.targetId).slice(0, 24);
          return (
            <div
              key={edge.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">
                {srcLabel} <span className="text-neutral-500">→</span> {tgtLabel}
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={edge.kind ?? 'logical'}
                  onChange={(e) => onUpdateEdge(edge.id, { kind: e.target.value })}
                  className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
                  data-testid="network-map-edge-kind"
                  aria-label={`Edge kind for ${srcLabel} to ${tgtLabel}`}
                >
                  {EDGE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={edge.label ?? 'manual'}
                  onChange={(e) => onUpdateEdge(edge.id, { label: e.target.value })}
                  maxLength={EDGE_LABEL_MAX}
                  className="w-28 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500"
                  data-testid="network-map-edge-label"
                  aria-label={`Edge label for ${srcLabel} to ${tgtLabel}`}
                />
                <button
                  type="button"
                  onClick={() => onDeleteEdge(edge.id)}
                  className="shrink-0 text-xs text-red-400 hover:text-red-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900"
                  data-testid="network-map-edge-delete"
                  aria-label={`Delete edge from ${srcLabel} to ${tgtLabel}`}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
