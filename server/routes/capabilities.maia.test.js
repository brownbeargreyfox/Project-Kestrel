// server/routes/capabilities.maia.test.js
//
// Tests for the intent-resolution -> MAIA memory mapping. Node built-ins only.
//
// Run:
//   node --test server/routes/capabilities.maia.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildIntentResolutionMemoryInput } from './capabilities.js';
import { createMemoryNode } from '../lib/maiaMemory.js';

const INTENT = {
  id: 'intent-1',
  title: 'Restart app-dotnet-01',
  assetId: '1000',
  recommendationId: 'rec-abc',
  severity: 'high',
  capability: 'system:action.request',
};

const CTX = { actor: 'op1', route: '/api/capabilities/intents/intent-1/approve', auditId: 'audit-9', note: 'looks good' };

test('approve maps to an operator memory node keyed by the intent asset', () => {
  const input = buildIntentResolutionMemoryInput(INTENT, 'approve', CTX);
  assert.equal(input.kind, 'operator.note');
  assert.equal(input.source, 'operator');
  assert.equal(input.assetId, '1000', 'unifies with AIDA recommend/accept history for the asset');
  assert.match(input.summary, /Intent approved: Restart app-dotnet-01/);
  assert.equal(input.detail, 'looks good');
  assert.equal(input.provenance.sourceEventType, 'intent.approved');
  assert.equal(input.provenance.recommendationId, 'rec-abc');
  assert.equal(input.provenance.auditId, 'audit-9');
});

test('reject maps to a rejected operator memory node', () => {
  const input = buildIntentResolutionMemoryInput(INTENT, 'reject', { ...CTX, note: '' });
  assert.match(input.summary, /Intent rejected: Restart app-dotnet-01/);
  assert.equal(input.detail, undefined, 'empty note omits detail');
  assert.equal(input.provenance.sourceEventType, 'intent.rejected');
});

test('node persists cleanly through MAIA normalization with expected tags', () => {
  const node = createMemoryNode(buildIntentResolutionMemoryInput(INTENT, 'approve', CTX));
  assert.equal(node.assetId, '1000');
  assert.deepEqual(node.tags, ['intent', 'approved', 'high', 'system:action.request']);
  assert.equal(node.confidence.value, 0.95);
  assert.ok(node.confidence.value >= 0 && node.confidence.value <= 1);
});

test('a manual intent without an assetId still records (no assetId key)', () => {
  const manualIntent = { id: 'intent-2', title: 'Manual capability request', severity: 'low', capability: 'audit:events.read' };
  const input = buildIntentResolutionMemoryInput(manualIntent, 'approve', CTX);
  assert.equal('assetId' in input, false, 'no assetId when the intent has none');
  assert.match(input.summary, /Intent approved: Manual capability request/);
  const node = createMemoryNode(input);
  assert.equal(node.assetId, undefined);
});
