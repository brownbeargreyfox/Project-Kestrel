// server/lib/manualAssets.js
//
// Local-only manual assets for AIDA Observe/Simulate. This lets an operator add
// infrastructure that does not yet run a Kestrel agent without hardcoding private
// LAN details into the repo. State lives in .kestrel/manual-assets.json.

import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const MANUAL_ASSETS_FILE = path.join(STATE_DIR, 'manual-assets.json');

const VALID_STATUSES = new Set(['online', 'warning', 'critical', 'offline', 'maintenance']);
const VALID_TIERS = new Set(['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid']);
const VALID_CRITICALITY = new Set(['low', 'medium', 'high', 'critical']);

function readManualAssetsFile(filePath = MANUAL_ASSETS_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err?.code === 'ENOENT') return {};
    throw err;
  }
}

function writeManualAssetsFile(assets, filePath = MANUAL_ASSETS_FILE) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(assets, null, 2)}\n`, 'utf8');
}

function sanitizeString(value, max = 160) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function sanitizeNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeMetrics(input = {}) {
  return {
    cpuUsage: sanitizeNumber(input.cpuUsage, 10, 0, 100),
    memoryUsage: sanitizeNumber(input.memoryUsage, 20, 0, 100),
    diskUsage: sanitizeNumber(input.diskUsage, 45, 0, 100),
    networkLatency: sanitizeNumber(input.networkLatency, 8, 0, 5000),
    storageIO: sanitizeNumber(input.storageIO, 500, 0, 100000),
    connections: sanitizeNumber(input.connections, 12, 0, 100000),
  };
}

export function normalizeManualAsset(input = {}) {
  const rawId = sanitizeString(input.id, 120) || sanitizeString(input.ip, 64) || sanitizeString(input.name, 120);
  const id = rawId.startsWith('manual:') ? rawId : `manual:${rawId}`;
  const name = sanitizeString(input.name, 160) || sanitizeString(input.hostname, 160) || sanitizeString(input.ip, 64) || id;
  const ip = sanitizeString(input.ip, 64);
  const type = sanitizeString(input.type, 80) || 'server';
  const os = sanitizeString(input.os, 120);
  const datacenter = sanitizeString(input.datacenter, 80) || 'home-lab';
  const tier = VALID_TIERS.has(input.tier) ? input.tier : 'app-tier';
  const criticality = VALID_CRITICALITY.has(input.criticality) ? input.criticality : 'medium';
  const status = VALID_STATUSES.has(input.status) ? input.status : 'online';

  if (!id || id === 'manual:') {
    throw new Error('Manual asset requires id, ip, or name.');
  }

  return {
    id,
    name,
    type,
    criticality,
    status,
    datacenter,
    tier,
    metrics: normalizeMetrics(input.metrics),
    currentIncident: input.currentIncident && typeof input.currentIncident === 'object' ? input.currentIncident : null,
    manual: true,
    ...(ip ? { ip } : {}),
    ...(os ? { os } : {}),
    lastSeen: Date.now(),
  };
}

export function listManualAssets(options = {}) {
  return Object.values(readManualAssetsFile(options.filePath));
}

export function upsertManualAsset(input, options = {}) {
  const asset = normalizeManualAsset(input);
  const assets = readManualAssetsFile(options.filePath);
  assets[asset.id] = asset;
  writeManualAssetsFile(assets, options.filePath);
  return asset;
}

export function deleteManualAsset(id, options = {}) {
  const assetId = sanitizeString(id, 120);
  const assets = readManualAssetsFile(options.filePath);
  const existed = Boolean(assets[assetId]);
  if (existed) {
    delete assets[assetId];
    writeManualAssetsFile(assets, options.filePath);
  }
  return existed;
}

export function mergeManualAssets(infraState, options = {}) {
  const manualAssets = listManualAssets(options);
  if (!manualAssets.length) return infraState;

  const existing = new Set((infraState.serverOverview || []).map((asset) => asset.id));
  const additions = manualAssets.filter((asset) => !existing.has(asset.id));
  const dcIds = new Set((infraState.datacenters || []).map((dc) => dc.id));
  const manualDatacenters = additions
    .filter((asset) => !dcIds.has(asset.datacenter))
    .map((asset) => ({ id: asset.datacenter, name: asset.datacenter }));

  return {
    ...infraState,
    serverOverview: [...(infraState.serverOverview || []), ...additions],
    datacenters: [...(infraState.datacenters || []), ...manualDatacenters],
  };
}
