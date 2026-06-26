// server/routes/network.discovery.test.js
//
// Pure contract tests for Network Discovery v0. These tests do not run real
// network scans; they validate the bounded discovery helpers and MAIA memory
// shape used by the explicit operator-triggered route.
//
// Run:
//   node --test server/routes/network.discovery.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNetworkDiscoveryEnabled,
  buildDiscoveryTargets,
  buildDiscoveryMemoryInput,
} from './network.js';
import { createMemoryNode } from '../lib/maiaMemory.js';

test('network discovery is disabled unless KESTREL_NETWORK_DISCOVERY is exactly true', () => {
  assert.equal(isNetworkDiscoveryEnabled({}), false);
  assert.equal(isNetworkDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: 'false' }), false);
  assert.equal(isNetworkDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: '1' }), false);
  assert.equal(isNetworkDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: 'TRUE' }), false);
  assert.equal(isNetworkDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: 'true' }), true);
});

test('discovery target generation rejects documentation/external CIDRs', () => {
  assert.throws(
    () => buildDiscoveryTargets('203.0.113.0/24'),
    /private RFC1918 IPv4/,
  );
  assert.throws(
    () => buildDiscoveryTargets('198.51.100.0/24'),
    /private RFC1918 IPv4/,
  );
});

test('discovery target generation allows bounded private /24 targets only', () => {
  const targets = buildDiscoveryTargets('10.0.0.0/24');
  assert.equal(targets.length, 254);
  assert.equal(targets[0], '10.0.0.1');
  assert.equal(targets.at(-1), '10.0.0.254');
  assert.ok(targets.length <= 256);
});

test('discovery target generation rejects larger or narrower CIDRs for v0', () => {
  assert.throws(() => buildDiscoveryTargets('10.0.0.0/16'), /only allows bounded \/24/);
  assert.throws(() => buildDiscoveryTargets('10.0.0.0/30'), /only allows bounded \/24/);
});

test('discovery target generation respects the explicit cap', () => {
  const targets = buildDiscoveryTargets('172.16.10.0/24', 16);
  assert.equal(targets.length, 16);
  assert.deepEqual(targets.slice(0, 3), ['172.16.10.1', '172.16.10.2', '172.16.10.3']);
});

test('discovery memory input records bounded ICMP discovery as operator context', () => {
  const input = buildDiscoveryMemoryInput(
    {
      cidr: '10.0.0.0/24',
      reason: 'operator requested discovery',
      targetCount: 254,
      aliveCount: 4,
      elapsedMs: 321,
    },
    { actor: 'local-admin', route: '/api/network/discovery/ping-sweep' },
  );

  const node = createMemoryNode(input);
  assert.equal(node.kind, 'operator.note');
  assert.equal(node.source, 'operator');
  assert.equal(node.assetId, 'network:10.0.0.0/24');
  assert.match(node.summary, /bounded ICMP discovery/);
  assert.match(node.detail, /Targets: 254/);
  assert.match(node.detail, /Responsive: 4/);
  assert.equal(node.provenance.actor, 'local-admin');
  assert.equal(node.provenance.sourceEventType, 'network.discovery.ping_sweep');
  assert.deepEqual(node.tags, ['network', 'discovery', 'icmp', 'operator-triggered']);
});
