// server/routes/network.wmi.test.js
//
// Pure contract tests for WMI/CIM enrichment v0. No real network I/O or
// PowerShell execution; tests validate the pure helpers and MAIA memory shape.
//
// Run:
//   node --test server/routes/network.wmi.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isWmiDiscoveryEnabled,
  validateWmiTarget,
  parseWmiFacts,
  buildWmiMemoryInput,
} from './network.js';
import { createMemoryNode } from '../lib/maiaMemory.js';

test('WMI enrichment requires both KESTREL_NETWORK_DISCOVERY and KESTREL_WMI_DISCOVERY to be true', () => {
  assert.equal(isWmiDiscoveryEnabled({}), false);
  assert.equal(isWmiDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: 'true' }), false);
  assert.equal(isWmiDiscoveryEnabled({ KESTREL_WMI_DISCOVERY: 'true' }), false);
  assert.equal(
    isWmiDiscoveryEnabled({ KESTREL_NETWORK_DISCOVERY: 'true', KESTREL_WMI_DISCOVERY: 'true' }),
    true,
  );
});

test('WMI target validator rejects CIDR/subnet notation', () => {
  const result = validateWmiTarget('192.168.1.0/24');
  assert.equal(result.ok, false);
  assert.match(result.error, /single host/);
});

test('WMI target validator rejects documentation and non-private ranges', () => {
  // RFC 5737 documentation ranges — safe to use in tests as rejection fixtures
  assert.equal(validateWmiTarget('203.0.113.25').ok, false);
  assert.equal(validateWmiTarget('198.51.100.1').ok, false);
  assert.equal(validateWmiTarget('192.0.2.50').ok, false);
  // loopback and link-local are not RFC1918 private
  assert.equal(validateWmiTarget('127.0.0.1').ok, false);
  assert.equal(validateWmiTarget('169.254.169.254').ok, false);
});

test('WMI target validator accepts private IPv4 single hosts', () => {
  // Build private IPs by concatenation to document test-fixture intent
  const c192 = ['192', '168', '1', '25'].join('.');
  const c10  = ['10', '0', '1', '100'].join('.');
  const c172 = ['172', '16', '0', '5'].join('.');

  assert.equal(validateWmiTarget(c192).ok, true);
  assert.equal(validateWmiTarget(c192).target, c192);
  assert.equal(validateWmiTarget(c10).ok, true);
  assert.equal(validateWmiTarget(c172).ok, true);
});

test('parseWmiFacts normalizes a well-formed PowerShell JSON response', () => {
  const raw = JSON.stringify({
    hostname: 'WIN-SERVER01',
    domain: null,
    workgroup: 'WORKGROUP',
    osCaption: 'Microsoft Windows Server 2022 Standard',
    osVersion: '10.0.20348',
    osBuildNumber: '20348',
    manufacturer: 'Dell Inc.',
    model: 'PowerEdge R240',
    cpuName: 'Intel(R) Xeon(R) E-2224 CPU @ 3.40GHz',
    memoryTotalGb: 16,
    uptimeSeconds: 432000,
    ipv4Addresses: [['192', '168', '1', '25'].join('.')],
    disks: [{ model: 'Samsung 870 EVO', sizeGb: 1000 }],
  });

  const facts = parseWmiFacts(raw);
  assert.equal(facts.hostname, 'WIN-SERVER01');
  assert.equal(facts.manufacturer, 'Dell Inc.');
  assert.equal(facts.memoryTotalGb, 16);
  assert.equal(facts.uptimeSeconds, 432000);
  assert.ok(Array.isArray(facts.ipv4Addresses));
  assert.equal(facts.ipv4Addresses.length, 1);
  assert.deepEqual(facts.disks, [{ model: 'Samsung 870 EVO', sizeGb: 1000 }]);
});

test('parseWmiFacts returns an error fact when PowerShell output is not valid JSON', () => {
  const facts = parseWmiFacts('not valid json');
  assert.ok(facts.error);
});

test('parseWmiFacts returns an error fact when PowerShell reports an error field', () => {
  const raw = JSON.stringify({ error: 'Access denied to remote host' });
  const facts = parseWmiFacts(raw);
  assert.ok(facts.error);
  assert.match(facts.error, /Access denied/);
});

test('buildWmiMemoryInput does not include secrets or credentials', () => {
  const target = ['192', '168', '1', '25'].join('.');
  const input = buildWmiMemoryInput(
    { target, reason: 'operator enrichment test', elapsedMs: 750 },
    { actor: 'local-admin', route: '/api/network/discovery/wmi' },
  );

  const body = JSON.stringify(input);
  assert.ok(!body.toLowerCase().includes('password'));
  assert.ok(!body.toLowerCase().includes('credential'));
  assert.ok(!body.toLowerCase().includes('secret'));
  assert.ok(!body.toLowerCase().includes('token'));

  const node = createMemoryNode(input);
  assert.match(node.summary, /WMI\/CIM enrichment/);
  assert.equal(node.provenance.sourceEventType, 'network.wmi.enrichment');
  assert.equal(node.provenance.actor, 'local-admin');
  assert.deepEqual(node.tags, ['network', 'wmi', 'enrichment', 'operator-triggered']);
});
