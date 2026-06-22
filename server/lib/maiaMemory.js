// server/lib/maiaMemory.js
//
// MAIA v0 — append-only memory substrate (Node built-ins only: fs, path, crypto).
//
// Constitutional rules honored here:
//   * MAIA interprets memory; it never acts, simulates, or calls providers.
//   * Memory is append-only. Nodes are never mutated or deleted. A correction is
//     a NEW `maia.correction` node carrying `revisionOf` pointing at the prior id.
//   * Every insight exposes provenance: the memory node ids used, a relevance
//     score, a confidence with basis, and coverage/bias warnings.
//
// State lives at `<cwd>/.kestrel/maia-memory.jsonl` by default. Tests override the
// directory/file via options so they never touch the real ledger.

import fs from 'node:fs';
import path from 'node:path';
import { clamp01, createMemoryNode, MEMORY_KINDS, MEMORY_VERSION } from './maiaMemoryNode.js';

// Re-export node construction so consumers/tests keep a single import surface.
export { createMemoryNode, MEMORY_KINDS, MEMORY_VERSION };

export const LOW_COVERAGE_THRESHOLD = 3;

const DEFAULT_STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const DEFAULT_FILE_NAME = 'maia-memory.jsonl';

function resolveFile(options = {}) {
  if (options.filePath) return options.filePath;
  return path.join(options.stateDir || DEFAULT_STATE_DIR, DEFAULT_FILE_NAME);
}

// ── append-only persistence ─────────────────────────────────────────────────────

export function appendMemoryNode(input, options = {}) {
  const node = createMemoryNode(input, options.now ?? Date.now());
  const file = resolveFile(options);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(node)}\n`, 'utf8');
  return node;
}

// Non-throwing variant for hot operator paths — MAIA memory must never block flow.
export function safeAppendMemoryNode(input, options = {}) {
  try {
    return appendMemoryNode(input, options);
  } catch (err) {
    console.warn(`[maia] memory append failed: ${err?.message ?? err}`);
    return null;
  }
}

function readAllNodes(options = {}) {
  let raw;
  try {
    raw = fs.readFileSync(resolveFile(options), 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const nodes = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      nodes.push(JSON.parse(line));
    } catch {
      // Tolerate a corrupt line without deleting it; append-only ledger is intact.
    }
  }
  return nodes;
}

function clampLimit(limit, fallback = 50, max = 500) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function matchesQuery(node, query = {}) {
  if (query.assetId && node.assetId !== query.assetId) return false;
  if (query.kind && node.kind !== query.kind) return false;
  return true;
}

// Newest-first; deterministic tie-break by id so equal timestamps are stable.
function byNewest(a, b) {
  if (a.ts !== b.ts) return a.ts < b.ts ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

export function readMemoryNodes(query = {}, options = {}) {
  const nodes = readAllNodes(options).filter((n) => matchesQuery(n, query));
  nodes.sort(byNewest);
  return nodes.slice(0, clampLimit(query.limit));
}

// ── deterministic relevance scoring ─────────────────────────────────────────────

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((t) => t.length >= 2);
}

function nodeHaystack(node) {
  return [node.summary, node.detail, node.assetName, (node.tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
}

// A node qualifies for a text query only on a real content/asset match — recency
// and kind boosts rank already-matched nodes, they never make a node "relevant".
function qualifies(node, query, tokens) {
  if (!tokens.length) return true;
  if (query.assetId && node.assetId === query.assetId) return true;
  const haystack = nodeHaystack(node);
  return tokens.some((token) => haystack.includes(token));
}

export function scoreMemoryRelevance(node, query = {}, now = Date.now()) {
  let score = 0;

  if (query.assetId && node.assetId && node.assetId === query.assetId) score += 0.5;

  const tokens = tokenize(query.q);
  if (tokens.length) {
    const haystack = nodeHaystack(node);
    let hits = 0;
    for (const token of tokens) if (haystack.includes(token)) hits += 1;
    score += Math.min(0.45, hits * 0.15);
  }

  if (query.kind && node.kind === query.kind) score += 0.1;
  if (query.source && node.source === query.source) score += 0.05;

  const ageMs = now - new Date(node.ts).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  if (Number.isFinite(ageMs) && ageMs >= 0) {
    if (ageMs <= dayMs) score += 0.1;
    else if (ageMs <= 7 * dayMs) score += 0.05;
  }

  return clamp01(score);
}

export function searchMemoryNodes(query = {}, options = {}) {
  const now = options.now ?? Date.now();
  const tokens = tokenize(query.q);
  const filtered = readAllNodes(options)
    .filter((n) => matchesQuery(n, query) && qualifies(n, query, tokens))
    .map((node) => ({ node, relevanceScore: scoreMemoryRelevance(node, query, now) }));

  filtered.sort((a, b) =>
    b.relevanceScore !== a.relevanceScore
      ? b.relevanceScore - a.relevanceScore
      : byNewest(a.node, b.node),
  );

  return filtered.slice(0, clampLimit(query.limit, 25));
}

// ── coverage + insights ─────────────────────────────────────────────────────────

export function buildCoverageSummary(nodes, query = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byKind = {};
  const bySource = {};
  const assets = new Set();
  let oldest = null;
  let newest = null;

  for (const n of list) {
    byKind[n.kind] = (byKind[n.kind] || 0) + 1;
    bySource[n.source] = (bySource[n.source] || 0) + 1;
    if (n.assetId) assets.add(n.assetId);
    if (!oldest || n.ts < oldest) oldest = n.ts;
    if (!newest || n.ts > newest) newest = n.ts;
  }

  const lowCoverage = list.length < LOW_COVERAGE_THRESHOLD;
  const warnings = [];
  if (lowCoverage) warnings.push('Low historical coverage: fewer than 3 relevant memory nodes.');
  if (query.assetId && !assets.has(query.assetId)) {
    warnings.push('No memory nodes recorded yet for this asset.');
  }

  return {
    totalNodes: list.length,
    assetsCovered: assets.size,
    byKind,
    bySource,
    oldest,
    newest,
    lowCoverage,
    warnings,
  };
}

function trimNodeForInsight(node) {
  const ref = { id: node.id, ts: node.ts, kind: node.kind, summary: node.summary };
  if (node.assetId) ref.assetId = node.assetId;
  return ref;
}

export function buildMemoryInsights(query = {}, options = {}) {
  const matches = searchMemoryNodes(query, options);
  if (!matches.length) return [];

  // Group relevant nodes by asset (fallback 'global') — one insight per group so
  // provenance stays legible rather than one-insight-per-node.
  const groups = new Map();
  for (const m of matches) {
    const key = m.node.assetId || 'global';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const insights = [];
  for (const [key, group] of groups) {
    const nodes = group.map((m) => m.node);
    const count = nodes.length;
    const lowCoverage = count < LOW_COVERAGE_THRESHOLD;
    const assetName = nodes.find((n) => n.assetName)?.assetName || (key !== 'global' ? key : null);
    const kinds = [...new Set(nodes.map((n) => n.kind))];

    const avg = nodes.reduce((s, n) => s + clamp01(n.confidence?.value), 0) / count;
    const value = Math.round(clamp01(lowCoverage ? avg * 0.9 : avg) * 100) / 100;
    const basis = `${count} matching memory node${count === 1 ? '' : 's'}${lowCoverage ? '; low historical coverage.' : '.'}`;

    const coverageWarnings = [];
    if (lowCoverage) coverageWarnings.push('Low historical coverage: fewer than 3 relevant memory nodes.');

    insights.push({
      id: `insight:${key}:${nodes[0].id}`,
      ...(key !== 'global' ? { assetId: key } : {}),
      ...(assetName ? { assetName } : {}),
      summary: `${count} related memory node${count === 1 ? '' : 's'} ${assetName ? `for ${assetName}` : 'across recent activity'} (${kinds.join(', ')}).`,
      whyItMatters:
        'Historical context before you accept, dismiss, or simulate. MAIA informs; it does not act.',
      relevanceScore: Math.round(group[0].relevanceScore * 100) / 100,
      confidence: { value, basis, lowCoverage },
      memoryNodes: nodes.map(trimNodeForInsight),
      coverageWarnings,
    });
  }

  insights.sort((a, b) =>
    b.relevanceScore !== a.relevanceScore
      ? b.relevanceScore - a.relevanceScore
      : a.id < b.id ? -1 : 1,
  );

  return insights.slice(0, clampLimit(options.insightLimit, 10, 25));
}
