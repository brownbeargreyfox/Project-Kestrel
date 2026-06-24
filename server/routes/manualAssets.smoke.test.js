// server/routes/manualAssets.smoke.test.js
//
// End-to-end smoke for the local manual asset workflow. It runs the real routes
// against a throwaway process.cwd(), so the user's real .kestrel is untouched.
//
// Run:
//   node --test server/routes/manualAssets.smoke.test.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

async function json(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { res, data };
}

test('manual asset smoke: action flag -> add -> preset update -> MAIA memory -> restore -> delete', async () => {
  const originalCwd = process.cwd();
  const originalServerFlag = process.env.KESTREL_WORKFLOW_ACTIONS;
  const originalClientFlag = process.env.VITE_FF_WORKFLOW_ACTIONS;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kestrel-manual-assets-'));
  let server;

  try {
    process.chdir(tmp);
    delete process.env.KESTREL_WORKFLOW_ACTIONS;
    delete process.env.VITE_FF_WORKFLOW_ACTIONS;

    const [{ default: manualAssets }, { default: maia }] = await Promise.all([
      import('./manualAssets.js'),
      import('./maia.js'),
    ]);

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api/aida/assets/manual', manualAssets);
    app.use('/api/maia', maia);

    server = await listen(app);
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const assetBody = {
      ip: '192.0.2.45',
      name: 'smoke-media-01',
      os: 'Ubuntu Server',
      type: 'media-server',
      datacenter: 'home-lab',
      tier: 'app-tier',
      criticality: 'medium',
      status: 'online',
      metrics: {
        cpuUsage: 12,
        memoryUsage: 35,
        diskUsage: 55,
        networkLatency: 4,
        storageIO: 800,
        connections: 8,
      },
    };

    const readWhenDisabled = await json('GET', `${base}/api/aida/assets/manual`);
    assert.equal(readWhenDisabled.res.status, 200);
    assert.equal(readWhenDisabled.data.ok, true);

    const blockedAdd = await json('POST', `${base}/api/aida/assets/manual`, assetBody);
    assert.equal(blockedAdd.res.status, 403);
    assert.equal(blockedAdd.data.ok, false);
    assert.match(blockedAdd.data.error, /KESTREL_WORKFLOW_ACTIONS=true/);

    process.env.KESTREL_WORKFLOW_ACTIONS = 'true';

    const add = await json('POST', `${base}/api/aida/assets/manual`, assetBody);
    assert.equal(add.res.status, 201);
    assert.equal(add.data.ok, true);
    assert.equal(add.data.asset.id, 'manual:192.0.2.45');
    assert.equal(add.data.asset.name, 'smoke-media-01');

    const assetId = add.data.asset.id;
    const highLatency = await json('PUT', `${base}/api/aida/assets/manual/${encodeURIComponent(assetId)}`, {
      ...assetBody,
      status: 'warning',
      metrics: { ...assetBody.metrics, networkLatency: 950, connections: 2500 },
      currentIncident: {
        type: 'manual-preset.high-latency',
        description: 'Operator-applied manual high latency preset.',
        injected: true,
      },
    });
    assert.equal(highLatency.res.status, 200);
    assert.equal(highLatency.data.ok, true);
    assert.equal(highLatency.data.asset.id, assetId);
    assert.equal(highLatency.data.asset.status, 'warning');
    assert.equal(highLatency.data.asset.metrics.networkLatency, 950);

    const memoryAfterPreset = await json('GET', `${base}/api/maia/memory?assetId=${encodeURIComponent(assetId)}&limit=10`);
    assert.equal(memoryAfterPreset.data.ok, true);
    assert.ok(memoryAfterPreset.data.nodes.some((node) => node.summary.includes('Manual asset added: smoke-media-01')));
    assert.ok(memoryAfterPreset.data.nodes.some((node) => node.summary.includes('manual-preset.high-latency')));

    const restore = await json('PUT', `${base}/api/aida/assets/manual/${encodeURIComponent(assetId)}`, {
      ...assetBody,
      status: 'online',
      metrics: assetBody.metrics,
      currentIncident: null,
    });
    assert.equal(restore.res.status, 200);
    assert.equal(restore.data.ok, true);
    assert.equal(restore.data.asset.status, 'online');
    assert.equal(restore.data.asset.currentIncident, null);

    const removed = await json('DELETE', `${base}/api/aida/assets/manual/${encodeURIComponent(assetId)}`);
    assert.equal(removed.res.status, 200);
    assert.equal(removed.data.ok, true);
    assert.equal(removed.data.deleted, true);

    const list = await json('GET', `${base}/api/aida/assets/manual`);
    assert.equal(list.data.ok, true);
    assert.equal(list.data.count, 0);

    const finalMemory = await json('GET', `${base}/api/maia/memory?assetId=${encodeURIComponent(assetId)}&limit=10`);
    assert.equal(finalMemory.data.ok, true);
    assert.ok(finalMemory.data.nodes.some((node) => node.summary.includes('Manual asset removed: smoke-media-01')));
    assert.ok(finalMemory.data.nodes.every((node) => node.assetId === assetId));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    process.chdir(originalCwd);
    if (originalServerFlag === undefined) delete process.env.KESTREL_WORKFLOW_ACTIONS;
    else process.env.KESTREL_WORKFLOW_ACTIONS = originalServerFlag;
    if (originalClientFlag === undefined) delete process.env.VITE_FF_WORKFLOW_ACTIONS;
    else process.env.VITE_FF_WORKFLOW_ACTIONS = originalClientFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
