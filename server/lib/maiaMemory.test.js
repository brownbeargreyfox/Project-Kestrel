// server/lib/maiaMemory.test.js
//
// MAIA memory substrate tests — Node built-ins only (node:test, node:assert, fs,
// os, path). No framework, no new dependency.
//
// Run:
//   node --test server/lib/maiaMemory.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createMemoryNode,
  appendMemoryNode,
  readMemoryNodes,
  searchMemoryNodes,
  buildMemoryInsights,
  buildCoverageSummary,
  scoreMemoryRelevance,
} from './maiaMemory.js';

function freshOptions() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maia-mem-'));
  return { stateDir: dir, filePath: path.join(dir, 'maia-memory.jsonl') };
}

const DAY = 24 * 60 * 60 * 1000;

test('createMemoryNode builds a valid append-only node', () => {
  const node = createMemoryNode(
    { kind: 'operator.note', source: 'operator', summary: 'Hello', tags: ['A', 'a', 'B'] },
    Date.parse('2026-06-21T00:00:00.000Z'),
  );
  assert.equal(node.version, 1);
  assert.equal(node.kind, 'operator.note');
  assert.equal(node.source, 'operator');
  assert.equal(node.summary, 'Hello');
  assert.deepEqual(node.tags, ['a', 'b']); // lower-cased + de-duped
  assert.equal(node.ts, '2026-06-21T00:00:00.000Z');
  assert.equal(node.revisionOf, null);
  assert.ok(node.id.startsWith('mem:'));
});

test('append + read returns newest-first', () => {
  const opts = freshOptions();
  appendMemoryNode({ kind: 'operator.note', summary: 'oldest', ts: '2026-06-01T00:00:00.000Z' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'middle', ts: '2026-06-10T00:00:00.000Z' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'newest', ts: '2026-06-20T00:00:00.000Z' }, opts);

  const nodes = readMemoryNodes({}, opts);
  assert.deepEqual(nodes.map((n) => n.summary), ['newest', 'middle', 'oldest']);
});

test('read filters by assetId', () => {
  const opts = freshOptions();
  appendMemoryNode({ kind: 'operator.note', summary: 'a1', assetId: 'asset-a' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'b1', assetId: 'asset-b' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'a2', assetId: 'asset-a' }, opts);

  const nodes = readMemoryNodes({ assetId: 'asset-a' }, opts);
  assert.equal(nodes.length, 2);
  assert.ok(nodes.every((n) => n.assetId === 'asset-a'));
});

test('search by text/tag produces deterministic relevance ordering', () => {
  const opts = freshOptions();
  const now = Date.parse('2026-06-21T00:00:00.000Z');
  appendMemoryNode({ kind: 'operator.note', summary: 'restart the web node', ts: '2026-06-20T00:00:00.000Z' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'unrelated disk note', ts: '2026-06-20T00:00:00.000Z' }, opts);
  appendMemoryNode({ kind: 'operator.note', summary: 'planned restart window', tags: ['restart'], ts: '2026-06-19T00:00:00.000Z' }, opts);

  const first = searchMemoryNodes({ q: 'restart' }, { ...opts, now });
  const second = searchMemoryNodes({ q: 'restart' }, { ...opts, now });
  assert.deepEqual(
    first.map((s) => s.node.summary),
    second.map((s) => s.node.summary),
    'identical queries yield identical ordering',
  );
  assert.ok(first.every((s) => /restart/.test(s.node.summary)), 'only restart-matching nodes returned');
  assert.ok(first[0].relevanceScore >= first[first.length - 1].relevanceScore, 'sorted by score desc');
});

test('low coverage warning appears when fewer than 3 relevant nodes', () => {
  const opts = freshOptions();
  const now = Date.parse('2026-06-21T00:00:00.000Z');
  appendMemoryNode({ kind: 'aida.recommendation.accepted', summary: 'restart applied', assetId: 'asset-a', ts: '2026-06-20T00:00:00.000Z' }, opts);
  appendMemoryNode({ kind: 'aida.recommendation.dismissed', summary: 'restart dismissed', assetId: 'asset-a', ts: '2026-06-20T00:00:00.000Z' }, opts);

  const insights = buildMemoryInsights({ assetId: 'asset-a', q: 'restart' }, { ...opts, now });
  assert.equal(insights.length, 1);
  assert.ok(insights[0].coverageWarnings.some((w) => /Low historical coverage/.test(w)));
  assert.equal(insights[0].confidence.lowCoverage, true);
  assert.deepEqual(insights[0].memoryNodes.length, 2);
  assert.ok(insights[0].memoryNodes.every((n) => typeof n.id === 'string' && n.id.length > 0), 'source node ids present');

  const coverage = buildCoverageSummary(readMemoryNodes({ assetId: 'asset-a' }, opts), { assetId: 'asset-a' });
  assert.equal(coverage.lowCoverage, true);
  assert.ok(coverage.warnings.some((w) => /Low historical coverage/.test(w)));
});

test('correction node appends with revisionOf and does not mutate the prior node', () => {
  const opts = freshOptions();
  const original = appendMemoryNode({ kind: 'operator.note', summary: 'original claim' }, opts);
  const correction = appendMemoryNode(
    { kind: 'maia.correction', summary: 'corrected claim', revisionOf: original.id },
    opts,
  );

  const lines = fs.readFileSync(opts.filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 2, 'both nodes persisted; nothing overwritten');

  const stored = lines.map((l) => JSON.parse(l));
  const storedOriginal = stored.find((n) => n.id === original.id);
  assert.equal(storedOriginal.summary, 'original claim', 'prior node is unchanged');
  assert.equal(correction.revisionOf, original.id);
  assert.equal(correction.kind, 'maia.correction');
});

test('invalid / oversized strings are sanitized', () => {
  const longSummary = 'x'.repeat(900);
  const node = createMemoryNode({
    kind: 'not-a-real-kind',
    source: 'bogus',
    summary: longSummary,
    assetId: 123, // non-string
    tags: ['  Spaces  ', 'DUP', 'dup', 7, 'ok'],
  });
  assert.equal(node.summary.length, 500, 'summary clamped to 500');
  assert.equal(node.kind, 'aida.observation.insight', 'unknown kind falls back');
  assert.equal(node.source, 'system', 'unknown source falls back');
  assert.equal(node.assetId, undefined, 'non-string assetId dropped');
  assert.deepEqual(node.tags, ['spaces', 'dup', 'ok'], 'tags trimmed/lowercased/de-duped, non-strings dropped');
});

test('confidence value is clamped to 0..1', () => {
  const high = createMemoryNode({ kind: 'operator.note', summary: 's', confidence: { value: 5 } });
  const low = createMemoryNode({ kind: 'operator.note', summary: 's', confidence: { value: -2 } });
  const nan = createMemoryNode({ kind: 'operator.note', summary: 's', confidence: { value: 'oops' } });
  assert.equal(high.confidence.value, 1);
  assert.equal(low.confidence.value, 0);
  assert.equal(nan.confidence.value, 0);
});

test('scoreMemoryRelevance rewards asset match and recency deterministically', () => {
  const now = Date.parse('2026-06-21T00:00:00.000Z');
  const recentAsset = createMemoryNode({ kind: 'operator.note', summary: 'note', assetId: 'asset-a', ts: new Date(now - DAY / 2).toISOString() });
  const oldOther = createMemoryNode({ kind: 'operator.note', summary: 'note', assetId: 'asset-b', ts: new Date(now - 30 * DAY).toISOString() });
  const sA = scoreMemoryRelevance(recentAsset, { assetId: 'asset-a' }, now);
  const sB = scoreMemoryRelevance(oldOther, { assetId: 'asset-a' }, now);
  assert.ok(sA > sB);
  assert.ok(sA <= 1 && sB >= 0);
});
