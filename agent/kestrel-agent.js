#!/usr/bin/env node
// agent/kestrel-agent.js
//
// Kestrel infrastructure telemetry agent.
// Reports real system metrics to the Kestrel server every N seconds.
//
// CONFIGURATION (env vars take priority over kestrel-agent.config.json):
//
//   KESTREL_SERVER_URL      e.g. http://192.168.1.100:3001
//   KESTREL_DATACENTER      logical datacenter/site label (e.g. home-lab)
//   KESTREL_TIER            dmz|web-tier|app-tier|data-tier|management|cloud-hybrid
//   KESTREL_TYPE            server|workstation|vm|nas|network|database|cache
//   KESTREL_CRITICALITY     0.0 – 1.0
//   KESTREL_INTERVAL_MS     report interval in ms (default 30000)
//   KESTREL_PING_HOST       host to ping for latency (default 1.1.1.1)
//
// DEPLOYMENT:
//   Windows  : npm install && node kestrel-agent.js
//              (wrap in NSSM or Task Scheduler for service)
//   Linux    : npm install && node kestrel-agent.js
//              (wrap in systemd for service)
//
// The agent ID is generated once and persisted to .kestrel-agent-id in the
// agent directory so it survives restarts and remains stable across reboots.

import si          from 'systeminformation';
import os          from 'os';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── config ────────────────────────────────────────────────────────────────────

function loadConfig() {
  let file = {};
  const configPath = resolve(__dirname, 'kestrel-agent.config.json');
  if (existsSync(configPath)) {
    try { file = JSON.parse(readFileSync(configPath, 'utf8')); } catch {}
  }
  return {
    serverUrl:   process.env.KESTREL_SERVER_URL   || file.serverUrl   || 'http://localhost:3001',
    datacenter:  process.env.KESTREL_DATACENTER   || file.datacenter  || 'default',
    tier:        process.env.KESTREL_TIER         || file.tier        || 'app-tier',
    type:        process.env.KESTREL_TYPE         || file.type        || 'server',
    criticality: Number(process.env.KESTREL_CRITICALITY ?? file.criticality ?? 0.5),
    intervalMs:  Number(process.env.KESTREL_INTERVAL_MS ?? file.intervalMs ?? 30_000),
    pingHost:    process.env.KESTREL_PING_HOST    || file.pingHost    || '1.1.1.1',
    agentToken:  process.env.KESTREL_AGENT_TOKEN  || file.agentToken  || null,
  };
}

// ── stable agent ID ───────────────────────────────────────────────────────────

function getOrCreateAgentId() {
  const idFile = resolve(__dirname, '.kestrel-agent-id');
  if (existsSync(idFile)) return readFileSync(idFile, 'utf8').trim();
  const id = randomUUID();
  writeFileSync(idFile, id, 'utf8');
  return id;
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function getUptimeSeconds() {
  if (typeof si.time === 'function') {
    try {
      const time = await si.time();
      return Math.round(asNumber(time?.uptime, os.uptime()));
    } catch {
      return Math.round(os.uptime());
    }
  }

  return Math.round(os.uptime());
}

// ── metrics collection ────────────────────────────────────────────────────────

async function collectMetrics(pingHost) {
  const [loadRes, memRes, disksRes, ioRes, connsRes, latRes] = await Promise.allSettled([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.disksIO(),
    si.networkConnections(),
    si.inetLatency(pingHost),
  ]);

  // CPU
  const cpuUsage = loadRes.status === 'fulfilled'
    ? Math.round(asNumber(loadRes.value?.currentLoad) * 10) / 10
    : 0;

  // Memory
  let memoryUsage = 0;
  if (memRes.status === 'fulfilled' && asNumber(memRes.value?.total) > 0) {
    memoryUsage = Math.round((asNumber(memRes.value?.used) / asNumber(memRes.value?.total)) * 1000) / 10;
  }

  // Disk — largest physical volume (excludes tmpfs/devfs on Linux)
  let diskUsage = 0;
  if (disksRes.status === 'fulfilled') {
    const physical = safeArray(disksRes.value).filter(
      (d) => asNumber(d?.size) > 1e9 && !d?.fs?.startsWith('tmpfs') && !d?.fs?.startsWith('devfs'),
    );
    if (physical.length > 0) {
      const primary = physical.reduce((a, b) => (asNumber(a?.size) > asNumber(b?.size) ? a : b));
      diskUsage = Math.round(asNumber(primary?.use) * 10) / 10;
    }
  }

  // Disk I/O (reads + writes per second). systeminformation can return null on
  // some Windows builds or non-admin sessions; missing I/O should not block ingest.
  let storageIO = 0;
  if (ioRes.status === 'fulfilled' && ioRes.value && typeof ioRes.value === 'object') {
    storageIO = Math.round(asNumber(ioRes.value.rIO_sec) + asNumber(ioRes.value.wIO_sec));
  }

  // Active network connections
  const connections = connsRes.status === 'fulfilled' ? safeArray(connsRes.value).length : 0;

  // Network latency (ICMP to pingHost)
  const networkLatency = latRes.status === 'fulfilled' && latRes.value != null
    ? Math.round(asNumber(latRes.value))
    : 0;

  return {
    cpuUsage: clamp(cpuUsage, 0, 100),
    memoryUsage: clamp(memoryUsage, 0, 100),
    diskUsage: clamp(diskUsage, 0, 100),
    storageIO,
    connections,
    networkLatency,
  };
}

// ── report ────────────────────────────────────────────────────────────────────

async function report(config, agentId, osInfo) {
  let metrics;
  try {
    metrics = await collectMetrics(config.pingHost);
  } catch (err) {
    console.error('[kestrel-agent] Metrics collection failed:', err.message);
    return;
  }

  const payload = {
    agentId,
    hostname:    os.hostname(),
    type:        config.type,
    datacenter:  config.datacenter,
    tier:        config.tier,
    criticality: config.criticality,
    metrics,
    os:          osInfo,
    uptime:      await getUptimeSeconds(),
    ts:          new Date().toISOString(),
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (config.agentToken) headers['Authorization'] = `Bearer ${config.agentToken}`;

    const res = await fetch(`${config.serverUrl}/api/telemetry/ingest`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`[kestrel-agent] Server rejected ingest (${res.status}): ${body.error ?? res.statusText}`);
      return;
    }

    console.log(
      `[kestrel-agent] ✓ ${new Date().toLocaleTimeString()} ` +
      `CPU ${metrics.cpuUsage.toFixed(1)}%  ` +
      `MEM ${metrics.memoryUsage.toFixed(1)}%  ` +
      `DISK ${metrics.diskUsage.toFixed(1)}%  ` +
      `LAT ${metrics.networkLatency}ms`,
    );
  } catch (err) {
    console.warn(`[kestrel-agent] Could not reach ${config.serverUrl}: ${err.message}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const config  = loadConfig();
  const agentId = getOrCreateAgentId();
  const osInfo  = await si.osInfo().catch(() => ({
    platform:  os.platform(),
    distro:    os.type(),
    release:   os.release(),
    arch:      os.arch(),
  }));

  console.log('[kestrel-agent] Starting');
  console.log(`  Agent ID   : ${agentId}`);
  console.log(`  Hostname   : ${os.hostname()}`);
  console.log(`  Server     : ${config.serverUrl}`);
  console.log(`  Datacenter : ${config.datacenter} / ${config.tier}`);
  console.log(`  Type       : ${config.type}  criticality: ${config.criticality}`);
  console.log(`  Interval   : ${config.intervalMs / 1000}s`);
  console.log(`  Auth token : ${config.agentToken ? 'configured' : 'none (open)'}`);
  console.log(`  OS         : ${osInfo.distro} ${osInfo.release} (${osInfo.arch})`);

  // First report immediately
  await report(config, agentId, osInfo);

  // Then on the configured interval
  setInterval(() => report(config, agentId, osInfo), config.intervalMs);
}

main().catch((err) => {
  console.error('[kestrel-agent] Fatal:', err);
  process.exit(1);
});
