// src/plugins/aida/views/manualAssetsPanelHelpers.js
//
// Pure, framework-free helpers for the Manual Assets panel. Client-side validation
// and metric clamping only — the backend (/api/aida/assets/manual) stays
// authoritative. No React, no fetch here.

// Metric bounds enforced in the UI before submit. Backend re-clamps regardless.
export const METRIC_BOUNDS = {
  cpuUsage: [0, 100],
  memoryUsage: [0, 100],
  diskUsage: [0, 100],
  networkLatency: [0, 5000],
  storageIO: [0, 100000],
  connections: [0, 100000],
};

// Defaults tuned to make adding a home Ubuntu media server one fill-in (the IP).
export const DEFAULT_MANUAL_ASSET_FORM = {
  ip: '',
  name: '',
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

export function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function clampMetrics(metrics = {}) {
  const out = {};
  for (const key of Object.keys(METRIC_BOUNDS)) {
    const [min, max] = METRIC_BOUNDS[key];
    out[key] = clampNumber(metrics[key], min, max);
  }
  return out;
}

// At least one of ip / name is required to identify the asset.
export function hasRequiredIdentity(form = {}) {
  return Boolean((form.ip && form.ip.trim()) || (form.name && form.name.trim()));
}

// Build the JSON payload for POST /api/aida/assets/manual from form state.
export function buildManualAssetPayload(form = {}) {
  return {
    ip: (form.ip || '').trim(),
    name: (form.name || '').trim(),
    os: (form.os || '').trim(),
    type: (form.type || '').trim(),
    datacenter: (form.datacenter || '').trim(),
    tier: form.tier,
    criticality: form.criticality,
    status: form.status,
    metrics: clampMetrics(form.metrics),
  };
}
