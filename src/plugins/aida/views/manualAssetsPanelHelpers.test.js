// src/plugins/aida/views/manualAssetsPanelHelpers.test.js
//
// Node built-in tests for the Manual Assets panel helpers (no framework).
//
// Run:
//   node --test src/plugins/aida/views/manualAssetsPanelHelpers.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampNumber,
  clampMetrics,
  hasRequiredIdentity,
  buildManualAssetPayload,
  DEFAULT_MANUAL_ASSET_FORM,
  METRIC_BOUNDS,
} from './manualAssetsPanelHelpers.js';

test('clampNumber bounds values and falls back to min for non-finite input', () => {
  assert.equal(clampNumber(50, 0, 100), 50);
  assert.equal(clampNumber(150, 0, 100), 100);
  assert.equal(clampNumber(-5, 0, 100), 0);
  assert.equal(clampNumber('abc', 0, 100), 0);
  assert.equal(clampNumber(undefined, 0, 5000), 0);
});

test('clampMetrics enforces per-metric bounds (pct 0-100, latency 0-5000, storage/conn 0-100000)', () => {
  const clamped = clampMetrics({
    cpuUsage: 999,
    memoryUsage: -10,
    diskUsage: 55,
    networkLatency: 999999,
    storageIO: -1,
    connections: 250000,
  });
  assert.equal(clamped.cpuUsage, 100);
  assert.equal(clamped.memoryUsage, 0);
  assert.equal(clamped.diskUsage, 55);
  assert.equal(clamped.networkLatency, 5000);
  assert.equal(clamped.storageIO, 0);
  assert.equal(clamped.connections, 100000);
});

test('clampMetrics covers exactly the documented metric keys', () => {
  assert.deepEqual(Object.keys(clampMetrics({})).sort(), Object.keys(METRIC_BOUNDS).sort());
});

test('hasRequiredIdentity requires either ip or name (trimmed)', () => {
  assert.equal(hasRequiredIdentity({ ip: '', name: '' }), false);
  assert.equal(hasRequiredIdentity({ ip: '   ', name: '   ' }), false);
  assert.equal(hasRequiredIdentity({ ip: '192.0.2.5', name: '' }), true);
  assert.equal(hasRequiredIdentity({ ip: '', name: 'media-01' }), true);
});

test('buildManualAssetPayload trims strings and clamps metrics', () => {
  const payload = buildManualAssetPayload({
    ip: '  192.0.2.5  ',
    name: '  Media  ',
    os: ' Ubuntu Server ',
    type: ' media-server ',
    datacenter: ' home-lab ',
    tier: 'app-tier',
    criticality: 'medium',
    status: 'online',
    metrics: { cpuUsage: 250, memoryUsage: 35, diskUsage: 55, networkLatency: 4, storageIO: 800, connections: 8 },
  });
  assert.equal(payload.ip, '192.0.2.5');
  assert.equal(payload.name, 'Media');
  assert.equal(payload.os, 'Ubuntu Server');
  assert.equal(payload.tier, 'app-tier');
  assert.equal(payload.metrics.cpuUsage, 100, 'out-of-range metric clamped');
  assert.equal(payload.metrics.connections, 8);
});

test('the default form is a valid, submittable home media server (no hardcoded IP)', () => {
  assert.equal(DEFAULT_MANUAL_ASSET_FORM.ip, '', 'no private IP prefilled');
  assert.equal(DEFAULT_MANUAL_ASSET_FORM.os, 'Ubuntu Server');
  assert.equal(DEFAULT_MANUAL_ASSET_FORM.type, 'media-server');
  assert.equal(DEFAULT_MANUAL_ASSET_FORM.datacenter, 'home-lab');
  // Defaults alone lack identity; the operator must supply ip or name.
  assert.equal(hasRequiredIdentity(DEFAULT_MANUAL_ASSET_FORM), false);
  const payload = buildManualAssetPayload({ ...DEFAULT_MANUAL_ASSET_FORM, name: 'media-01' });
  assert.deepEqual(payload.metrics, DEFAULT_MANUAL_ASSET_FORM.metrics, 'in-range defaults pass through unchanged');
});
