// server/routes/network.map.test.js
//
// Pure contract tests for the network map layout helpers. No network activity,
// no file I/O — only sanitizeMapLayout is exercised (a pure exported function).
//
// Run:
//   node --test server/routes/network.map.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeMapLayout } from './network.js';

test('sanitizeMapLayout returns empty nodes and edges for missing or empty input', () => {
  for (const input of [null, undefined, {}, { nodes: null, edges: null }]) {
    const layout = sanitizeMapLayout(input);
    assert.deepEqual(layout.nodes, []);
    assert.deepEqual(layout.edges, []);
    assert.ok(typeof layout.updatedAt === 'string', 'updatedAt must be a string');
    assert.ok(!Number.isNaN(Date.parse(layout.updatedAt)), 'updatedAt must parse as a date');
  }
});

test('sanitizeMapLayout passes through valid nodes with position and label', () => {
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'n1', deviceKey: 'ip:192.0.2.1', x: 100, y: 200, pinned: false, label: 'Switch' }],
    edges: [],
  });
  assert.equal(layout.nodes.length, 1);
  const [n] = layout.nodes;
  assert.equal(n.id, 'n1');
  assert.equal(n.deviceKey, 'ip:192.0.2.1');
  assert.equal(n.x, 100);
  assert.equal(n.y, 200);
  assert.equal(n.label, 'Switch');
  assert.equal(n.pinned, false);
});

test('sanitizeMapLayout clamps x/y to ±10000 canvas bounds', () => {
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'n1', x: 999999, y: -999999 }],
    edges: [],
  });
  assert.equal(layout.nodes[0].x, 10000);
  assert.equal(layout.nodes[0].y, -10000);
});

test('sanitizeMapLayout defaults non-finite x/y to 0', () => {
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'n1', x: NaN, y: Infinity }, { id: 'n2', x: -Infinity, y: undefined }],
    edges: [],
  });
  assert.equal(layout.nodes[0].x, 0);
  assert.equal(layout.nodes[0].y, 0);
  assert.equal(layout.nodes[1].x, 0);
  assert.equal(layout.nodes[1].y, 0);
});

test('sanitizeMapLayout drops nodes with empty or missing id', () => {
  const layout = sanitizeMapLayout({
    nodes: [
      { id: '', x: 0, y: 0 },
      { id: null, x: 0, y: 0 },
      { id: '   ', x: 0, y: 0 },
      { id: 'valid', x: 0, y: 0 },
    ],
    edges: [],
  });
  assert.equal(layout.nodes.length, 1);
  assert.equal(layout.nodes[0].id, 'valid');
});

test('sanitizeMapLayout normalizes unknown edge kinds to "unknown"', () => {
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b', kind: 'ethernet' },
      { id: 'e2', sourceId: 'a', targetId: 'b', kind: 'wifi' },
      { id: 'e3', sourceId: 'a', targetId: 'b', kind: 'logical' },
      { id: 'e4', sourceId: 'a', targetId: 'b', kind: 'unknown' },
      { id: 'e5', sourceId: 'a', targetId: 'b', kind: 'bad-kind' },
      { id: 'e6', sourceId: 'a', targetId: 'b', kind: undefined },
    ],
  });
  const kinds = layout.edges.map((e) => e.kind);
  assert.deepEqual(kinds, ['ethernet', 'wifi', 'logical', 'unknown', 'unknown', 'unknown']);
});

test('sanitizeMapLayout drops edges that reference non-existent node ids', () => {
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'n1', x: 0, y: 0 }],
    edges: [
      { id: 'e1', sourceId: 'n1', targetId: 'ghost' },
      { id: 'e2', sourceId: 'ghost', targetId: 'n1' },
      { id: 'e3', sourceId: 'ghost', targetId: 'other-ghost' },
    ],
  });
  assert.equal(layout.edges.length, 0);
});

test('sanitizeMapLayout caps nodes at MAP_LAYOUT_MAX_NODES (256)', () => {
  const nodes = Array.from({ length: 300 }, (_, i) => ({ id: `n${i}`, x: i, y: 0 }));
  const layout = sanitizeMapLayout({ nodes, edges: [] });
  assert.equal(layout.nodes.length, 256);
});

test('sanitizeMapLayout caps edges at MAP_LAYOUT_MAX_EDGES (512)', () => {
  const nodeA = { id: 'a', x: 0, y: 0 };
  const nodeB = { id: 'b', x: 100, y: 0 };
  const edges = Array.from({ length: 600 }, (_, i) => ({
    id: `e${i}`, sourceId: 'a', targetId: 'b', kind: 'logical',
  }));
  const layout = sanitizeMapLayout({ nodes: [nodeA, nodeB], edges });
  assert.equal(layout.edges.length, 512);
});

test('sanitizeMapLayout truncates labels that exceed 128 characters', () => {
  const longLabel = 'z'.repeat(200);
  const layout = sanitizeMapLayout({
    nodes: [{ id: 'n1', x: 0, y: 0, label: longLabel }],
    edges: [],
  });
  assert.equal(layout.nodes[0].label.length, 128);
});

test('sanitizeMapLayout always includes a valid ISO updatedAt timestamp', () => {
  const layout = sanitizeMapLayout({});
  assert.ok(typeof layout.updatedAt === 'string');
  assert.ok(!Number.isNaN(Date.parse(layout.updatedAt)));
});
