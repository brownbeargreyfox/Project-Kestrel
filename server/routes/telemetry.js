// server/routes/telemetry.js
//
// Real-data ingestion and agent management endpoints.
//
//   POST /api/telemetry/ingest          — agent heartbeat (metrics payload)
//   GET  /api/telemetry/agents          — list all known agents + status
//   PUT  /api/telemetry/agents/:id      — operator overrides (label, tier, etc.)
//   GET  /api/telemetry/mode            — 'live' | 'mock' + agent count
//
// Agents call /ingest every 30 s (configurable). The server broadcasts an SSE
// event after each ingest so connected UIs update without polling.

import { Router } from 'express';
import { ingestHeartbeat, updateAgentConfig, getAgentList, getAgentCount, hasRealData } from '../lib/liveState.js';
import { broadcast } from '../lib/eventBus.js';

const router = Router();

const REQUIRED_FIELDS = ['agentId', 'hostname', 'metrics'];
const VALID_TIERS = ['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid'];
const VALID_STATUSES = ['server', 'workstation', 'vm', 'nas', 'network', 'database', 'cache', 'hypervisor', 'container'];

function sanitize(v, max = 128) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function validateHeartbeat(body) {
  for (const f of REQUIRED_FIELDS) {
    if (!body[f]) return `Missing required field: ${f}`;
  }
  if (typeof body.metrics !== 'object') return 'metrics must be an object';
  const m = body.metrics;
  for (const k of ['cpuUsage', 'memoryUsage']) {
    const v = Number(m[k]);
    if (isNaN(v) || v < 0 || v > 100) return `metrics.${k} must be 0–100`;
  }
  return null;
}

// ── POST /ingest ──────────────────────────────────────────────────────────────
router.post('/ingest', (req, res) => {
  const err = validateHeartbeat(req.body);
  if (err) return res.status(400).json({ ok: false, error: err });

  const payload = {
    agentId:     sanitize(req.body.agentId, 64),
    hostname:    sanitize(req.body.hostname, 128),
    type:        sanitize(req.body.type, 32)        || 'server',
    datacenter:  sanitize(req.body.datacenter, 64)  || 'default',
    tier:        sanitize(req.body.tier, 32)         || 'app-tier',
    criticality: Math.max(0, Math.min(1, Number(req.body.criticality) || 0.5)),
    metrics: {
      cpuUsage:       Math.max(0, Math.min(100, Number(req.body.metrics.cpuUsage)       || 0)),
      memoryUsage:    Math.max(0, Math.min(100, Number(req.body.metrics.memoryUsage)    || 0)),
      diskUsage:      Math.max(0, Math.min(100, Number(req.body.metrics.diskUsage)      || 0)),
      networkLatency: Math.max(0, Math.min(60000, Number(req.body.metrics.networkLatency) || 0)),
      storageIO:      Math.max(0,               Number(req.body.metrics.storageIO)      || 0),
      connections:    Math.max(0,               Number(req.body.metrics.connections)    || 0),
    },
    os:      req.body.os     || null,
    uptime:  Number(req.body.uptime) || null,
    ts:      req.body.ts     || new Date().toISOString(),
  };

  ingestHeartbeat(payload);

  // SSE push so open browser tabs update immediately
  broadcast('telemetry.update', {
    agentId:  payload.agentId,
    hostname: payload.hostname,
    ts:       payload.ts,
    metrics:  payload.metrics,
  });

  return res.json({ ok: true, agentId: payload.agentId, ts: payload.ts });
});

// ── GET /agents ───────────────────────────────────────────────────────────────
router.get('/agents', (req, res) => {
  const agents = getAgentList();
  res.json({
    ok:    true,
    mode:  hasRealData() ? 'live' : 'mock',
    count: agents.length,
    agents,
  });
});

// ── PUT /agents/:id ───────────────────────────────────────────────────────────
router.put('/agents/:id', (req, res) => {
  const agentId = sanitize(req.params.id, 64);
  if (!agentId) return res.status(400).json({ ok: false, error: 'Missing agent ID.' });

  const patch = {};
  if (req.body.label      != null) patch.label       = sanitize(req.body.label, 128);
  if (req.body.datacenter != null) patch.datacenter  = sanitize(req.body.datacenter, 64);
  if (req.body.tier       != null) {
    if (!VALID_TIERS.includes(req.body.tier)) {
      return res.status(400).json({ ok: false, error: `Invalid tier. Valid: ${VALID_TIERS.join(', ')}` });
    }
    patch.tier = req.body.tier;
  }
  if (req.body.type != null) patch.type = sanitize(req.body.type, 32);
  if (req.body.criticality != null) {
    const c = Number(req.body.criticality);
    if (isNaN(c) || c < 0 || c > 1) return res.status(400).json({ ok: false, error: 'criticality must be 0–1' });
    patch.criticality = c;
  }

  updateAgentConfig(agentId, patch);
  res.json({ ok: true, agentId, patch });
});

// ── GET /mode ─────────────────────────────────────────────────────────────────
router.get('/mode', (req, res) => {
  const live = hasRealData();
  res.json({
    ok:         true,
    mode:       live ? 'live' : 'mock',
    agentCount: getAgentCount(),
    message:    live
      ? `${getAgentCount()} agent(s) reporting real telemetry.`
      : 'No agents connected — AIDA is running on simulated mock data. Deploy the Kestrel agent on your endpoints.',
  });
});

export default router;
