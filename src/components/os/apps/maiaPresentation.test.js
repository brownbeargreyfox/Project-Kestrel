// src/components/os/apps/maiaPresentation.test.js
//
// Node built-in tests for the shared MAIA presentation helpers.
//
// Run:
//   node --test src/components/os/apps/maiaPresentation.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { kindLabel, formatMemoryDate, pct, MEMORY_KIND_LABELS } from './maiaPresentation.js';

test('kindLabel maps known kinds and falls back gracefully', () => {
  assert.equal(kindLabel('aida.recommendation.accepted'), 'Accepted');
  assert.equal(kindLabel('operator.note'), 'Operator note');
  assert.equal(kindLabel('maia.correction'), 'Correction');
  assert.equal(kindLabel('some.unknown.kind'), 'some.unknown.kind', 'unknown kind passes through');
  assert.equal(kindLabel(''), 'Unknown');
  assert.equal(kindLabel(undefined), 'Unknown');
});

test('every known memory kind has a label', () => {
  for (const kind of Object.keys(MEMORY_KIND_LABELS)) {
    assert.ok(kindLabel(kind).length > 0);
  }
});

test('formatMemoryDate handles valid, empty, and invalid input', () => {
  assert.equal(formatMemoryDate(''), '—');
  assert.equal(formatMemoryDate(null), '—');
  assert.equal(formatMemoryDate('not-a-date'), '—');
  const formatted = formatMemoryDate('2026-06-24T00:00:00.000Z');
  assert.notEqual(formatted, '—');
  assert.equal(typeof formatted, 'string');
});

test('pct rounds a 0..1 ratio to a whole percentage', () => {
  assert.equal(pct(0.82), '82%');
  assert.equal(pct(0), '0%');
  assert.equal(pct(1), '100%');
  assert.equal(pct(undefined), '0%');
  assert.equal(pct('oops'), '0%');
});
