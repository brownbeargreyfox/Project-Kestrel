// server/lib/infraState.js
//
// Node-safe in-process live infrastructure state for AIDA's Observation pillar.
// Starts from the static mock seed and drifts metrics every 15 seconds so that
// Observe and Recommend react to evolving conditions, not a frozen snapshot.
//
// Design: a simple metric-drift loop — no browser deps, no import.meta.env.
// The live state is a deep clone of the mock; the original module export is
// never mutated.

import mockServerData from '../../src/data/mockserverdata.js';

let liveState = null;
let timer = null;

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function drift(value, magnitude, lo, hi) {
  return clamp(value + (Math.random() - 0.5) * 2 * magnitude, lo, hi);
}

function evolve() {
  liveState.serverOverview = liveState.serverOverview.map((server) => {
    const m = { ...server.metrics };

    m.cpuUsage       = drift(m.cpuUsage,       6,  2, 98);
    m.memoryUsage    = drift(m.memoryUsage,     3,  5, 98);
    m.networkLatency = drift(m.networkLatency, 18,  1, 500);
    m.diskUsage      = drift(m.diskUsage,       0.8, 5, 95);
    m.storageIO      = drift(m.storageIO,      200, 100, 5000);
    m.connections    = drift(m.connections,     30,  0, 1000);

    // Status follows metrics for non-critical / non-offline assets
    let status = server.status;
    if (status !== 'offline' && status !== 'maintenance') {
      if (m.cpuUsage > 90 || m.memoryUsage > 92) {
        status = 'critical';
      } else if (m.cpuUsage > 78 || m.memoryUsage > 82 || m.networkLatency > 280) {
        status = 'warning';
      } else if (status === 'warning' && Math.random() < 0.25) {
        // 25% chance to self-heal from warning per tick
        status = 'online';
      } else if (status === 'critical' && Math.random() < 0.10) {
        status = 'warning';
      }
    }

    return { ...server, metrics: m, status };
  });
}

function ensureStarted() {
  if (liveState) return;
  liveState = deepClone(mockServerData);
  // First tick immediately so the state is warm before the first request
  evolve();
  timer = setInterval(evolve, 15_000);
  // Don't block process exit
  if (timer.unref) timer.unref();
}

export function getInfraState() {
  ensureStarted();
  return liveState;
}

export function stopEvolution() {
  if (timer) { clearInterval(timer); timer = null; }
}
