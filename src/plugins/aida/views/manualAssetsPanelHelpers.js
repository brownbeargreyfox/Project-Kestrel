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

export const MANUAL_ASSET_SIMULATION_PRESETS = [
  {
    id: 'high-latency',
    label: 'Simulate high latency',
    description: 'Raise network latency and connections while keeping the asset reachable.',
    patch: {
      status: 'warning',
      metrics: { networkLatency: 950, connections: 2500 },
      currentIncident: {
        type: 'manual-preset.high-latency',
        description: 'Operator-applied manual high latency preset.',
        injected: true,
      },
    },
  },
  {
    id: 'disk-pressure',
    label: 'Simulate disk pressure',
    description: 'Raise disk usage and lower storage IO to model storage pressure.',
    patch: {
      status: 'critical',
      metrics: { diskUsage: 94, storageIO: 120, networkLatency: 25 },
      currentIncident: {
        type: 'manual-preset.disk-pressure',
        description: 'Operator-applied manual disk pressure preset.',
        injected: true,
      },
    },
  },
  {
    id: 'offline',
    label: 'Simulate offline',
    description: 'Mark the asset offline and zero active connections.',
    patch: {
      status: 'offline',
      metrics: { networkLatency: 5000, connections: 0, storageIO: 0 },
      currentIncident: {
        type: 'manual-preset.offline',
        description: 'Operator-applied manual offline preset.',
        injected: true,
      },
    },
  },
  {
    id: 'restore-online',
    label: 'Restore online',
    description: 'Clear the manual preset incident and return to safe online defaults.',
    patch: {
      status: 'online',
      metrics: { cpuUsage: 12, memoryUsage: 35, diskUsage: 55, networkLatency: 4, storageIO: 800, connections: 8 },
      currentIncident: null,
    },
  },
];

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
    ...(Object.prototype.hasOwnProperty.call(form, 'currentIncident') ? { currentIncident: form.currentIncident } : {}),
  };
}

export function buildManualAssetPresetPayload(asset = {}, presetId) {
  const preset = MANUAL_ASSET_SIMULATION_PRESETS.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown manual asset simulation preset: ${presetId}`);

  return buildManualAssetPayload({
    id: asset.id,
    ip: asset.ip || '',
    name: asset.name || '',
    os: asset.os || '',
    type: asset.type || 'server',
    datacenter: asset.datacenter || 'home-lab',
    tier: asset.tier || 'app-tier',
    criticality: asset.criticality || 'medium',
    status: preset.patch.status || asset.status || 'online',
    metrics: {
      ...(asset.metrics || {}),
      ...(preset.patch.metrics || {}),
    },
    currentIncident: preset.patch.currentIncident,
  });
}
