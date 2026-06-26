// src/components/os/apps/networkDeviceToManualAsset.test.js
//
// Node built-in tests for the device -> manual-asset mapping.
//
// Run:
//   node --test src/components/os/apps/networkDeviceToManualAsset.test.js

import test from 'node:test';
import assert from 'node:assert/strict';

import { networkDeviceToManualAsset, deviceDisplayName } from './networkDeviceToManualAsset.js';

test('deviceDisplayName prefers displayName > label > hostname > mac > ip', () => {
  assert.equal(deviceDisplayName({ displayName: 'A', label: 'B', ip: '192.0.2.9' }), 'A');
  assert.equal(deviceDisplayName({ label: 'B', hostname: 'h', ip: '192.0.2.9' }), 'B');
  assert.equal(deviceDisplayName({ hostname: 'h', ip: '192.0.2.9' }), 'h');
  assert.equal(deviceDisplayName({ ip: '192.0.2.9' }), '192.0.2.9');
  assert.equal(deviceDisplayName({}), 'device');
});

test('maps a camera/iot device to a media-friendly manual asset', () => {
  const a = networkDeviceToManualAsset({ ip: '192.0.2.20', hostname: 'garage-cam', kind: 'camera/iot', trustState: 'unknown' });
  assert.equal(a.ip, '192.0.2.20');
  assert.equal(a.name, 'garage-cam');
  assert.equal(a.type, 'camera');
  assert.equal(a.datacenter, 'home-lab');
  assert.equal(a.tier, 'app-tier');
  assert.equal(a.criticality, 'medium');
  assert.equal(a.status, 'online');
  assert.equal(a.metrics.cpuUsage, 10);
});

test('watch/blocked trust elevates criticality to high', () => {
  assert.equal(networkDeviceToManualAsset({ ip: '192.0.2.21', kind: 'unknown', trustState: 'watch' }).criticality, 'high');
  assert.equal(networkDeviceToManualAsset({ ip: '192.0.2.22', kind: 'unknown', trustState: 'blocked' }).criticality, 'high');
  assert.equal(networkDeviceToManualAsset({ ip: '192.0.2.23', kind: 'unknown', trustState: 'trusted' }).criticality, 'medium');
});

test('unknown/missing kind falls back to a generic server type', () => {
  assert.equal(networkDeviceToManualAsset({ ip: '192.0.2.24' }).type, 'server');
  assert.equal(networkDeviceToManualAsset({ ip: '192.0.2.25', kind: 'router/gateway' }).type, 'router');
});

test('a device with no ip still yields a usable payload identified by name', () => {
  const a = networkDeviceToManualAsset({ hostname: 'printer-1', kind: 'printer' });
  assert.equal(a.ip, '');
  assert.equal(a.name, 'printer-1');
  assert.equal(a.type, 'printer');
});
