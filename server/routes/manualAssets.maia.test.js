// server/routes/manualAssets.maia.test.js
//
// Tests for the manual-asset -> MAIA memory mapping. Node built-ins only.
//
// Run:
//   node --test server/routes/manualAssets.maia.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildManualAssetMemoryInput,
  buildManualAssetDeleteMemoryInput,
} from './manualAssets.js';
import { createMemoryNode } from '../lib/maiaMemory.js';

const CTX = { actor: 'local-admin', route: '/api/aida/assets/manual' };

const ASSET = {
  id: 'manual:media-01',
  name: 'media-01',
  type: 'media-server',
  datacenter: 'home-lab',
  tier: 'app-tier',
  criticality: 'medium',
  status: 'online',
  ip: '192.0.2.5',
};

test('buildManualAssetMemoryInput maps an added asset to an operator memory node', () => {
  const input = buildManualAssetMemoryInput(ASSET, CTX);
  assert.equal(input.kind, 'operator.note');
  assert.equal(input.source, 'operator');
  assert.equal(input.assetId, 'manual:media-01', 'assetId is the manual asset id so MAIA groups by it');
  assert.equal(input.assetName, 'media-01');
  assert.match(input.summary, /Manual asset added: media-01/);
  assert.match(input.summary, /media-server/);
  assert.match(input.summary, /home-lab\/app-tier/);
  assert.equal(input.provenance.sourceEventType, 'aida.manual-asset.added');
  assert.equal(input.provenance.actor, 'local-admin');
  assert.equal(input.provenance.route, '/api/aida/assets/manual');
});

test('added-asset node persists cleanly through MAIA normalization', () => {
  const node = createMemoryNode(buildManualAssetMemoryInput(ASSET, CTX));
  assert.equal(node.assetId, 'manual:media-01');
  assert.deepEqual(node.tags, ['manual-asset', 'asset-added', 'media-server', 'app-tier', 'medium', 'online']);
  assert.ok(node.confidence.value >= 0 && node.confidence.value <= 1);
  assert.equal(node.confidence.value, 0.9);
  assert.equal(node.detail, 'ip 192.0.2.5');
});

test('an asset without an ip omits the detail line', () => {
  const node = createMemoryNode(buildManualAssetMemoryInput({ ...ASSET, ip: undefined }, CTX));
  assert.equal(node.detail, undefined);
});

test('buildManualAssetDeleteMemoryInput maps a removal to a descriptive operator memory node', () => {
  const input = buildManualAssetDeleteMemoryInput(ASSET, {
    actor: 'op2',
    route: '/api/aida/assets/manual/manual:media-01',
  });
  assert.equal(input.kind, 'operator.note');
  assert.equal(input.source, 'operator');
  assert.equal(input.assetId, 'manual:media-01');
  assert.equal(input.assetName, 'media-01');
  assert.match(input.summary, /Manual asset removed: media-01/);
  assert.deepEqual(input.tags, ['manual-asset', 'asset-removed', 'media-server', 'app-tier', 'medium', 'online']);
  assert.equal(input.detail, 'ip 192.0.2.5');
  assert.equal(input.provenance.sourceEventType, 'aida.manual-asset.removed');
  assert.equal(input.provenance.actor, 'op2');
});

test('remove mapping can fall back to id-only when the previous asset record is unavailable', () => {
  const input = buildManualAssetDeleteMemoryInput('manual:missing', CTX);
  assert.equal(input.assetId, 'manual:missing');
  assert.equal(input.assetName, 'manual:missing');
  assert.deepEqual(input.tags, ['manual-asset', 'asset-removed']);
});

test('add and remove nodes share the same assetId so device history is unified', () => {
  const add = createMemoryNode(buildManualAssetMemoryInput(ASSET, CTX));
  const remove = createMemoryNode(buildManualAssetDeleteMemoryInput(ASSET, CTX));
  assert.equal(add.assetId, remove.assetId);
});
