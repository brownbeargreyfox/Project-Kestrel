// server/lib/maiaMemoryNode.js
//
// MAIA memory node construction + normalization (pure, Node built-ins only).
// Split out of maiaMemory.js to keep each file focused and under the line limit.
// A node, once created and appended, is never mutated — corrections are new
// `maia.correction` nodes carrying `revisionOf`.

import crypto from 'node:crypto';

export const MEMORY_VERSION = 1;

export const MEMORY_KINDS = [
  'aida.recommendation.accepted',
  'aida.recommendation.dismissed',
  'aida.simulation.run',
  'aida.observation.insight',
  'operator.note',
  'maia.correction',
];

const MEMORY_SOURCES = ['aida', 'operator', 'system'];

export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function sanitizeString(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, 40);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

function normalizeConfidence(input) {
  const c = input && typeof input === 'object' ? input : {};
  return {
    value: clamp01(c.value),
    basis: sanitizeString(c.basis, 280) || 'No explicit basis recorded.',
    lowCoverage: Boolean(c.lowCoverage),
  };
}

function normalizeProvenance(input) {
  const p = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const key of ['route', 'actor', 'auditId', 'recommendationId', 'simulationId', 'sourceEventType']) {
    const v = sanitizeString(p[key], 200);
    if (v) out[key] = v;
  }
  return out;
}

function toIso(value, now) {
  if (value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date(now).toISOString();
}

export function createMemoryNode(input = {}, now = Date.now()) {
  const node = {
    id: typeof input.id === 'string' && input.id ? input.id : `mem:${crypto.randomUUID()}`,
    version: MEMORY_VERSION,
    ts: toIso(input.ts, now),
    kind: MEMORY_KINDS.includes(input.kind) ? input.kind : 'aida.observation.insight',
    source: MEMORY_SOURCES.includes(input.source) ? input.source : 'system',
    summary: sanitizeString(input.summary, 500),
    tags: normalizeTags(input.tags),
    confidence: normalizeConfidence(input.confidence),
    provenance: normalizeProvenance(input.provenance),
    revisionOf: typeof input.revisionOf === 'string' && input.revisionOf ? input.revisionOf : null,
  };
  const assetId = sanitizeString(input.assetId, 120);
  if (assetId) node.assetId = assetId;
  const assetName = sanitizeString(input.assetName, 200);
  if (assetName) node.assetName = assetName;
  const detail = sanitizeString(input.detail, 2000);
  if (detail) node.detail = detail;
  return node;
}
