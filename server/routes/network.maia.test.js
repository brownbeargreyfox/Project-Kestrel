// server/routes/network.maia.test.js
//
// Tests for the Network Inventory -> MAIA memory mapping. Node built-ins only.
//
// Run:
//   node --test server/routes/network.maia.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { isClearedLabelPatch, buildLabelMemoryInput, buildAckMemoryInput } from './network.js';
import { createMemoryNode } from '../lib/maiaMemory.js';

const CTX = { actor: 'local-admin', route: '/api/network/labels' };

test('isClearedLabelPatch is true only for an empty classification', () => {
  assert.equal(isClearedLabelPatch({ label: '', trustState: 'unknown', notes: '', tags: [], kind: '' }), true);
  assert.equal(isClearedLabelPatch({ label: 'Garage Cam', trustState: 'unknown', notes: '', tags: [], kind: '' }), false);
  assert.equal(isClearedLabelPatch({ label: '', trustState: 'watch', notes: '', tags: [], kind: '' }), false);
  assert.equal(isClearedLabelPatch({ label: '', trustState: 'unknown', notes: '', tags: [], kind: 'camera/iot' }), false);
  assert.equal(isClearedLabelPatch({ label: '', trustState: 'unknown', notes: '', tags: ['iot'], kind: '' }), false);
});

test('buildLabelMemoryInput maps a label patch to an operator memory node keyed by device', () => {
  const key = 'ip:192.168.1.50';
  const patch = { label: 'Garage Cam', trustState: 'watch', kind: 'camera/iot', notes: 'side door', tags: ['iot'] };
  const input = buildLabelMemoryInput(key, patch, CTX);

  assert.equal(input.kind, 'operator.note');
  assert.equal(input.source, 'operator');
  assert.equal(input.assetId, key, 'assetId is the device key so MAIA groups by device');
  assert.equal(input.assetName, 'Garage Cam');
  assert.match(input.summary, /Garage Cam/);
  assert.match(input.summary, /trust=watch/);
  assert.match(input.summary, /kind=camera\/iot/);
  assert.equal(input.provenance.sourceEventType, 'network.label.saved');
  assert.equal(input.provenance.actor, 'local-admin');
});

test('an empty kind is dropped from tags after normalization', () => {
  const key = 'mac:aa:bb:cc:dd:ee:ff';
  // No kind set — the raw tags array carries an empty string that must be cleaned.
  const patch = { label: 'Printer', trustState: 'trusted', kind: '', notes: '', tags: ['office'] };
  const node = createMemoryNode(buildLabelMemoryInput(key, patch, CTX));

  assert.ok(!node.tags.includes(''), 'empty kind tag is dropped');
  assert.deepEqual(node.tags, ['network', 'label', 'trusted', 'office']);
  assert.equal(node.assetId, key);
  assert.match(node.summary, /trust=trusted/);
  assert.ok(!/kind=/.test(node.summary), 'no kind clause when kind is empty');
});

test('buildAckMemoryInput maps an acknowledgement to an operator memory node', () => {
  const key = 'ip:10.0.0.7';
  const input = buildAckMemoryInput(key, { actor: 'op2', route: '/api/network/devices/acknowledge' });

  assert.equal(input.kind, 'operator.note');
  assert.equal(input.source, 'operator');
  assert.equal(input.assetId, key);
  assert.match(input.summary, /Acknowledged newly-seen device ip:10\.0\.0\.7/);
  assert.deepEqual(input.tags, ['network', 'acknowledge']);
  assert.equal(input.provenance.sourceEventType, 'network.device.acknowledged');
  assert.equal(input.provenance.actor, 'op2');
});

test('confidence is well-formed and clamped once normalized', () => {
  const node = createMemoryNode(buildAckMemoryInput('ip:10.0.0.7', CTX));
  assert.ok(node.confidence.value >= 0 && node.confidence.value <= 1);
  assert.equal(node.confidence.value, 0.9);
  assert.equal(node.confidence.lowCoverage, false);
});
