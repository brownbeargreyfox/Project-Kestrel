// src/components/os/apps/maiaPresentation.js
//
// Shared, framework-free presentation helpers for MAIA memory UI. Single source
// of truth for kind labels and value formatting so the AssetMemoryContext, the
// MAIA memory cards, and the Reflect decision feed cannot drift apart.

export const MEMORY_KIND_LABELS = {
  'aida.recommendation.accepted': 'Accepted',
  'aida.recommendation.dismissed': 'Dismissed',
  'aida.simulation.run': 'Simulation',
  'aida.observation.insight': 'Observation',
  'operator.note': 'Operator note',
  'maia.correction': 'Correction',
};

export function kindLabel(kind) {
  return MEMORY_KIND_LABELS[kind] || kind || 'Unknown';
}

export function formatMemoryDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function pct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}
