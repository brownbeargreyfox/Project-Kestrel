// server/routes/aidaSimulationSelection.test.js
//
// Tests for stale simulation asset recovery. Node built-ins only.
//
// Run:
//   node --test server/routes/aidaSimulationSelection.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { selectSimulationAsset } from './aidaSimulationSelection.js';

const state = {
  serverOverview: [
    { id: 'live-a', status: 'online', metrics: { cpuUsage: 20, memoryUsage: 30, networkLatency: 20 } },
    { id: 'live-b', status: 'warning', metrics: { cpuUsage: 82, memoryUsage: 60, networkLatency: 90 } },
    { id: 'live-c', status: 'online', currentIncident: { type: 'memory_exhaustion' }, metrics: { cpuUsage: 30, memoryUsage: 94, networkLatency: 20 } },
  ],
};

test('keeps a valid current asset id unchanged', () => {
  const selected = selectSimulationAsset('live-b', state);
  assert.equal(selected.assetId, 'live-b');
  assert.equal(selected.recovered, false);
  assert.equal(selected.requestedAssetId, 'live-b');
});

test('recovers a stale asset id to the highest-priority current asset', () => {
  const selected = selectSimulationAsset('1017', state);
  assert.equal(selected.assetId, 'live-c');
  assert.equal(selected.recovered, true);
  assert.equal(selected.requestedAssetId, '1017');
});

test('does not invent an asset when no current assets exist', () => {
  const selected = selectSimulationAsset('1017', { serverOverview: [] });
  assert.equal(selected.assetId, '1017');
  assert.equal(selected.recovered, false);
});

test('does not recover an empty asset id', () => {
  const selected = selectSimulationAsset('', state);
  assert.equal(selected.assetId, '');
  assert.equal(selected.recovered, false);
});
