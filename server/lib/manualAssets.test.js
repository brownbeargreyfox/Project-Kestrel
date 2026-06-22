// server/lib/manualAssets.test.js
//
// Tests for local manual AIDA asset support. Node built-ins only.
//
// Run:
//   node --test server/lib/manualAssets.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeManualAsset, upsertManualAsset, listManualAssets, deleteManualAsset, mergeManualAssets } from './manualAssets.js';

const SAMPLE_IP = '192.0.2.57'; // RFC 5737 TEST-NET-1, not a real LAN address.

function freshFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-assets-'));
  return path.join(dir, 'manual-assets.json');
}

test('normalizes a manual Ubuntu server asset', () => {
  const asset = normalizeManualAsset({ ip: SAMPLE_IP, name: 'Media Server', os: 'Ubuntu Server', type: 'media-server' });
  assert.equal(asset.id, `manual:${SAMPLE_IP}`);
  assert.equal(asset.name, 'Media Server');
  assert.equal(asset.ip, SAMPLE_IP);
  assert.equal(asset.os, 'Ubuntu Server');
  assert.equal(asset.type, 'media-server');
  assert.equal(asset.datacenter, 'home-lab');
  assert.equal(asset.tier, 'app-tier');
  assert.equal(asset.status, 'online');
  assert.equal(asset.manual, true);
});

test('upsert/list/delete persists manual assets locally', () => {
  const filePath = freshFile();
  const added = upsertManualAsset({ ip: SAMPLE_IP, name: 'Media Server' }, { filePath });
  assert.equal(added.id, `manual:${SAMPLE_IP}`);
  assert.equal(listManualAssets({ filePath }).length, 1);
  assert.equal(deleteManualAsset(`manual:${SAMPLE_IP}`, { filePath }), true);
  assert.equal(listManualAssets({ filePath }).length, 0);
});

test('mergeManualAssets adds manual assets and datacenters without replacing live assets', () => {
  const filePath = freshFile();
  upsertManualAsset({ ip: SAMPLE_IP, name: 'Media Server', datacenter: 'home-lab' }, { filePath });
  const merged = mergeManualAssets({
    serverOverview: [{ id: 'agent:desktop', name: 'Desktop', datacenter: 'local-dev' }],
    serverTypes: [],
    datacenters: [{ id: 'local-dev', name: 'local-dev' }],
  }, { filePath });

  assert.equal(merged.serverOverview.length, 2);
  assert.ok(merged.serverOverview.some((asset) => asset.id === `manual:${SAMPLE_IP}`));
  assert.ok(merged.datacenters.some((dc) => dc.id === 'home-lab'));
});
