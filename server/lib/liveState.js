// server/lib/liveState.js
//
// Real-data ingest store — replaces the mock drift loop once agents connect.
//
// Architecture:
//   - `heartbeats`   in-memory map: agentId → latest payload (lost on restart)
//   - `registry`     persisted to .kestrel/asset-registry.json
//                    operator overrides for label, datacenter, tier, type,
//                    criticality — survive restarts and take priority over
//                    agent-reported config
//
// `getLiveInfraState()` returns the same schema as mockserverdata so the AIDA
// engine works identically whether data is real or mock.

import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const REGISTRY_FILE = path.join(STATE_DIR, 'asset-registry.json');
const OFFLINE_THRESHOLD_MS = 90_000;

// ── in-memory stores ──────────────────────────────────────────────────────────
const heartbeats = new Map(); // agentId → { ...payload, lastSeen: epoch }
let registry     = {};        // agentId → { label, datacenter, tier, type, criticality }

function loadRegistry() {
  try {
    registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    registry = {};
  }
}

function saveRegistry() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
  } catch (err) {
    console.warn('[liveState] Could not save registry:', err.message);
  }
}

loadRegistry();

// ── helpers ───────────────────────────────────────────────────────────────────

function criticality_to_level(c) {
  if (c >= 0.9) return 'critical';
  if (c >= 0.7) return 'high';
  if (c >= 0.4) return 'medium';
  return 'low';
}

function computeStatus(metrics, lastSeen) {
  if (Date.now() - lastSeen > OFFLINE_THRESHOLD_MS) return 'offline';
  const cpu = metrics?.cpuUsage  ?? 0;
  const mem = metrics?.memoryUsage ?? 0;
  const lat = metrics?.networkLatency ?? 0;
  if (cpu > 90 || mem > 92) return 'critical';
  if (cpu > 78 || mem > 82 || lat > 280) return 'warning';
  return 'online';
}

function detectIncident(metrics, status) {
  if (status === 'offline') {
    return { type: 'agent_offline', severity: 'critical', description: 'No heartbeat received within 90-second threshold.' };
  }
  const cpu  = metrics?.cpuUsage  ?? 0;
  const mem  = metrics?.memoryUsage ?? 0;
  const disk = metrics?.diskUsage ?? 0;
  const lat  = metrics?.networkLatency ?? 0;
  if (mem  > 92) return { type: 'memory_exhaustion', severity: 'critical', description: `Memory at ${Math.round(mem)}%.` };
  if (cpu  > 90) return { type: 'cpu_overload',     severity: 'critical', description: `CPU at ${Math.round(cpu)}%.` };
  if (disk > 90) return { type: 'disk_pressure',    severity: 'high',     description: `Disk at ${Math.round(disk)}%.` };
  if (lat  > 300) return { type: 'high_latency',    severity: 'high',     description: `Network latency ${Math.round(lat)} ms.` };
  return null;
}

// ── public API ────────────────────────────────────────────────────────────────

export function ingestHeartbeat(payload) {
  const agentId = payload.agentId;
  if (!agentId) return;
  heartbeats.set(agentId, { ...payload, lastSeen: Date.now() });

  // Auto-register if first-ever heartbeat from this agent
  if (!registry[agentId]) {
    registry[agentId] = {
      label:       payload.hostname,
      datacenter:  payload.datacenter  || 'default',
      tier:        payload.tier        || 'app-tier',
      type:        payload.type        || 'server',
      criticality: payload.criticality ?? 0.5,
    };
    saveRegistry();
  }
}

export function updateAgentConfig(agentId, patch) {
  registry[agentId] = { ...(registry[agentId] || {}), ...patch };
  saveRegistry();
}

export function hasRealData() {
  return heartbeats.size > 0;
}

export function getAgentCount() {
  return heartbeats.size;
}

export function getAgentList() {
  const now = Date.now();
  return Array.from(heartbeats.values()).map((h) => {
    const cfg     = registry[h.agentId] || {};
    const offline = now - h.lastSeen > OFFLINE_THRESHOLD_MS;
    return {
      agentId:     h.agentId,
      hostname:    h.hostname,
      label:       cfg.label       || h.hostname,
      type:        cfg.type        || h.type        || 'server',
      datacenter:  cfg.datacenter  || h.datacenter  || 'default',
      tier:        cfg.tier        || h.tier        || 'app-tier',
      criticality: cfg.criticality ?? h.criticality ?? 0.5,
      os:          h.os,
      uptime:      h.uptime,
      lastSeen:    h.lastSeen,
      seenAgo:     Math.round((now - h.lastSeen) / 1000),
      status:      computeStatus(h.metrics, h.lastSeen),
      offline,
      metrics:     h.metrics,
    };
  });
}

export function getRegistryConfig(agentId) {
  return registry[agentId] || null;
}

export function getLiveInfraState() {
  const serverOverview = Array.from(heartbeats.values()).map((h) => {
    const cfg         = registry[h.agentId] || {};
    const metrics     = h.metrics || {};
    const datacenter  = cfg.datacenter  || h.datacenter  || 'default';
    const tier        = cfg.tier        || h.tier        || 'app-tier';
    const criticality = cfg.criticality ?? h.criticality ?? 0.5;
    const status      = computeStatus(metrics, h.lastSeen);

    return {
      id:             h.agentId,
      name:           cfg.label || h.hostname,
      type:           cfg.type  || h.type || 'server',
      criticality:    criticality_to_level(criticality),
      status,
      datacenter,
      tier,
      metrics,
      currentIncident: detectIncident(metrics, status),
      os:             h.os,
      uptime:         h.uptime,
      lastSeen:       h.lastSeen,
      agentReported:  true,
    };
  });

  // Dynamic datacenter index so AIDA engine resolves datacenterName correctly
  const dcMap = new Map();
  for (const s of serverOverview) {
    if (!dcMap.has(s.datacenter)) dcMap.set(s.datacenter, s.datacenter);
  }
  const datacenters = Array.from(dcMap.entries()).map(([id, name]) => ({ id, name }));

  // serverTypes empty → engine defaults to medium criticality. Sysadmins set
  // per-asset criticality via the registry (registry stores float 0–1, engine
  // reads level string from server.criticality via the engine's direct-field
  // fallback added to scoreAsset).
  return { serverOverview, serverTypes: [], datacenters };
}
