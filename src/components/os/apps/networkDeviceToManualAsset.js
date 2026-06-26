// src/components/os/apps/networkDeviceToManualAsset.js
//
// Pure mapping from a Network Inventory device to an AIDA manual-asset payload,
// so an operator can promote a discovered device into something AIDA can observe
// and simulate. No fetch, no React — the panel POSTs the result to the existing
// (workflow-gated) /api/aida/assets/manual endpoint.

const KIND_TO_TYPE = {
  'router/gateway': 'router',
  'this-host': 'host',
  'network-device': 'network-device',
  phone: 'phone',
  'camera/iot': 'camera',
  'media/iot': 'media-server',
  printer: 'printer',
  computer: 'workstation',
  unknown: 'server',
};

export function deviceDisplayName(device = {}) {
  return device.displayName || device.label || device.hostname || device.mac || device.ip || 'device';
}

export function networkDeviceToManualAsset(device = {}) {
  const kind = device.kind || 'unknown';
  const elevated = device.trustState === 'blocked' || device.trustState === 'watch';
  return {
    ip: device.ip || '',
    name: deviceDisplayName(device),
    os: '',
    type: KIND_TO_TYPE[kind] || 'server',
    datacenter: 'home-lab',
    tier: 'app-tier',
    criticality: elevated ? 'high' : 'medium',
    status: 'online',
    metrics: {
      cpuUsage: 10,
      memoryUsage: 20,
      diskUsage: 40,
      networkLatency: 5,
      storageIO: 500,
      connections: 4,
    },
  };
}
