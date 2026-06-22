// server/lib/infraState.js
//
// Unified infrastructure state provider.
//
// Priority:
//   1. Live data (real agents reporting via /api/telemetry/ingest) — used the
//      moment the first agent heartbeat arrives; stays live as long as agents
//      are reporting.
//   2. Mock drift (seed from mockserverdata, evolved every 15 s) — active only
//      when no agents are connected. Exists so AIDA has something meaningful to
//      reason about during development / demo. Shows a MOCK badge in the UI.
//
// Local manual assets from .kestrel/manual-assets.json are merged into either
// live or mock state so non-agent infrastructure can still be observed/simulated.
//
// The AIDA engine is unaware of which source is active — it only sees the
// { serverOverview, serverTypes, datacenters } schema.

import mockServerData from '../../src/data/mockserverdata.js';
import { hasRealData, getLiveInfraState } from './liveState.js';
import { mergeManualAssets } from './manualAssets.js';

// ── mock drift (only used when no real agents) ────────────────────────────────
let mockState  = null;
let mockTimer  = null;

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function drift(value, magnitude, lo, hi) {
  return clamp(value + (Math.random() - 0.5) * 2 * magnitude, lo, hi);
}

function evolve() {
  mockState.serverOverview = mockState.serverOverview.map((server) => {
    const m = { ...server.metrics };
    m.cpuUsage       = drift(m.cpuUsage,       6,   2, 98);
    m.memoryUsage    = drift(m.memoryUsage,     3,   5, 98);
    m.networkLatency = drift(m.networkLatency, 18,   1, 500);
    m.diskUsage      = drift(m.diskUsage,     0.8,   5, 95);
    m.storageIO      = drift(m.storageIO,     200, 100, 5000);
    m.connections    = drift(m.connections,    30,   0, 1000);

    let status = server.status;
    if (status !== 'offline' && status !== 'maintenance') {
      if (m.cpuUsage > 90 || m.memoryUsage > 92)                       status = 'critical';
      else if (m.cpuUsage > 78 || m.memoryUsage > 82 || m.networkLatency > 280) status = 'warning';
      else if (status === 'warning'  && Math.random() < 0.25)          status = 'online';
      else if (status === 'critical' && Math.random() < 0.10)          status = 'warning';
    }
    return { ...server, metrics: m, status };
  });
}

function ensureMockStarted() {
  if (mockState) return;
  mockState = deepClone(mockServerData);
  evolve();
  mockTimer = setInterval(evolve, 15_000);
  if (mockTimer.unref) mockTimer.unref();
}

export function stopEvolution() {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
}

// ── public API ────────────────────────────────────────────────────────────────

export function getInfraState() {
  if (hasRealData()) return mergeManualAssets(getLiveInfraState());
  ensureMockStarted();
  return mergeManualAssets(mockState);
}

export function getDataMode() {
  return hasRealData() ? 'live' : 'mock';
}
