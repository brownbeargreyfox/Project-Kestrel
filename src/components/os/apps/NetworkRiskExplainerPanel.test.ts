// Tests for the deterministic Network Risk Explainer helpers.
//
// Uses only Node built-ins (node:test + node:assert) — no test framework
// dependency is added. Bundle with esbuild (already present transitively via
// Vite) and run with Node's built-in test runner:
//
//   npx esbuild src/components/os/apps/NetworkRiskExplainerPanel.test.ts \
//     --bundle --platform=node --format=esm --outfile=tmp.test.mjs
//   node tmp.test.mjs && rm tmp.test.mjs
//
// `npm run build` (vite/esbuild) does not process this file because it is outside
// the app import graph, so the production build is unaffected.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explainDeviceRisk,
  readChecks,
  readBrokerRequest,
  type ExplainResponse,
} from './NetworkRiskExplainerPanel.js';

const DEVICE = { deviceKey: 'abc', ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff' };

function fakeFetch(body: unknown, ok = true, status = 200) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = (async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body };
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// ── submit (success) path ───────────────────────────────────────────────────────

test('explainDeviceRisk makes exactly one POST to the explain endpoint with { device }', async () => {
  const payload: ExplainResponse = { ok: true, evidence: {}, confidenceInputs: {} };
  const { impl, calls } = fakeFetch(payload);

  const result = await explainDeviceRisk(DEVICE, impl);

  assert.equal(calls.length, 1, 'exactly one request');
  assert.equal(calls[0]!.url, '/api/network-risk/explain');
  assert.equal(calls[0]!.init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { device: DEVICE });
  assert.equal(result, payload);
});

// ── error path ────────────────────────────────────────────────────────────────

test('explainDeviceRisk throws the server-provided error message on a non-ok payload', async () => {
  const { impl } = fakeFetch(
    { ok: false, error: 'Provide device object from Network Inventory.' },
    false,
    400,
  );

  await assert.rejects(
    () => explainDeviceRisk(DEVICE, impl),
    /Provide device object from Network Inventory\./,
  );
});

test('explainDeviceRisk falls back to an HTTP message when no error field is present', async () => {
  const { impl } = fakeFetch({ ok: false }, false, 500);
  await assert.rejects(() => explainDeviceRisk(DEVICE, impl), /HTTP 500/);
});

// ── degraded / partial response handling ────────────────────────────────────────

test('readChecks accepts recommendedChecks, operatorChecks, or checks, and defaults to []', () => {
  assert.deepEqual(readChecks({ recommendedChecks: ['a'] }), ['a']);
  assert.deepEqual(readChecks({ operatorChecks: ['b'] }), ['b']);
  assert.deepEqual(readChecks({ checks: ['c'] }), ['c']);
  assert.deepEqual(readChecks({}), [], 'missing checks degrade to empty list');
  assert.deepEqual(readChecks(null), []);
});

test('readBrokerRequest accepts brokerRequest or brokerRequestPreview, else null', () => {
  const broker = { method: 'POST', path: '/api/ai/broker/complete' };
  assert.equal(readBrokerRequest({ brokerRequest: broker }), broker);
  assert.equal(readBrokerRequest({ brokerRequestPreview: broker }), broker);
  assert.equal(readBrokerRequest({}), null, 'missing broker preview degrades to null');
});

test('a degraded but ok payload still resolves (panel renders what exists)', async () => {
  const partial: ExplainResponse = { ok: true, evidence: { ip: '10.0.0.2' } };
  const { impl } = fakeFetch(partial);
  const result = await explainDeviceRisk(DEVICE, impl);
  assert.equal(result.ok, true);
  assert.deepEqual(readChecks(result), []);
  assert.equal(readBrokerRequest(result), null);
});
