// src/components/os/apps/NetworkTopologyApp.jsx

import React from 'react';
import { Globe, Router, Monitor, RefreshCw, Radar, ShieldAlert, Wifi } from 'lucide-react';

const KIND_LABELS = {
  'router/gateway': 'Router / Gateway',
  'this-host': 'This PC',
  'network-device': 'Network Device',
  'phone': 'Phone',
  'camera/iot': 'Camera / IoT',
  'media/iot': 'Media / IoT',
  'printer': 'Printer',
  'computer': 'Computer',
  'unknown': 'Unknown',
};

function formatDeviceName(device) {
  return device.hostname || device.mac || device.ip;
}

function getKindIcon(kind) {
  if (kind === 'router/gateway') return Router;
  if (kind === 'this-host' || kind === 'computer') return Monitor;
  return Wifi;
}

function getDeviceScore(device) {
  let score = 0;
  if (!device.hostname) score += 1;
  if (!device.mac) score += 1;
  if (device.kind === 'unknown' || device.kind === 'network-device') score += 1;
  return score;
}

function DeviceCard({ device, selected, onSelect }) {
  const Icon = getKindIcon(device.kind);
  const score = getDeviceScore(device);

  return (
    <button
      type="button"
      onClick={() => onSelect(device)}
      className={`w-full rounded-lg border p-3 text-left transition hover:bg-neutral-800 ${
        selected ? 'border-sky-400 bg-neutral-800' : 'border-neutral-700 bg-neutral-900/70'
      }`}
      data-testid={`network-device-${device.ip}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-neutral-800 p-2">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-neutral-100">{formatDeviceName(device)}</div>
            <div className="mt-1 text-xs text-neutral-400">{device.ip}</div>
            <div className="mt-1 truncate text-xs text-neutral-500">{device.mac || 'No MAC visible'}</div>
          </div>
        </div>
        <div className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
          {KIND_LABELS[device.kind] || device.kind}
        </div>
      </div>
      {score > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <ShieldAlert size={14} />
          <span>{score} unknown signal{score > 1 ? 's' : ''}</span>
        </div>
      )}
    </button>
  );
}

export default function NetworkTopologyApp() {
  const [inventory, setInventory] = React.useState(null);
  const [selectedIp, setSelectedIp] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const selectedDevice = React.useMemo(() => {
    return inventory?.devices?.find((device) => device.ip === selectedIp) ?? null;
  }, [inventory, selectedIp]);

  const loadInventory = React.useCallback(async (mode = 'passive') => {
    setLoading(true);
    setError(null);
    try {
      const qs = mode === 'ping' ? '?scan=ping' : '';
      const response = await fetch(`/api/network/devices${qs}`);
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Network inventory failed with HTTP ${response.status}`);
      }
      setInventory(payload);
      setSelectedIp((current) => {
        if (current && payload.devices.some((device) => device.ip === current)) return current;
        return payload.devices[0]?.ip ?? null;
      });
    } catch (err) {
      setError(err?.message ?? 'Failed to load network inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadInventory('passive');
  }, [loadInventory]);

  const devices = inventory?.devices ?? [];
  const unknownCount = devices.filter((device) => getDeviceScore(device) > 0).length;
  const routerCount = devices.filter((device) => device.kind === 'router/gateway').length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="home-network-inventory">
      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="text-sky-300" size={20} />
              <h2 className="text-lg font-semibold">Home Network Inventory</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              Live local inventory from this machine: interfaces + ARP cache. Optional ping refresh only touches your private LAN.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadInventory('passive')}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
              data-testid="network-refresh-passive"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
              Refresh Passive
            </button>
            <button
              type="button"
              onClick={() => loadInventory('ping')}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-700 bg-sky-950/70 px-3 py-2 text-sm hover:bg-sky-900 disabled:opacity-50"
              data-testid="network-refresh-ping"
            >
              <Radar size={16} />
              Ping Sweep /24
            </button>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 border-b border-neutral-800 p-4 md:grid-cols-4">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Devices</div>
          <div className="mt-1 text-2xl font-semibold">{inventory?.count ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Routers</div>
          <div className="mt-1 text-2xl font-semibold">{routerCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Unknown Signals</div>
          <div className="mt-1 text-2xl font-semibold">{unknownCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Mode</div>
          <div className="mt-1 text-sm font-semibold">{inventory?.scanMode ?? 'loading'}</div>
          <div className="mt-1 text-xs text-neutral-500">{inventory?.elapsedMs ? `${inventory.elapsedMs}ms` : '—'}</div>
        </div>
      </section>

      {error && (
        <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200" data-testid="network-inventory-error">
          {error}
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
        <section className="min-h-0 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/60 p-3" data-testid="network-device-list">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Discovered devices</h3>
            <span className="text-xs text-neutral-500">{inventory?.scannedAt ? new Date(inventory.scannedAt).toLocaleTimeString() : ''}</span>
          </div>

          {loading && devices.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">Reading local network inventory…</div>
          ) : devices.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              No devices found yet. Try “Ping Sweep /24” to populate the ARP cache.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => (
                <DeviceCard
                  key={`${device.ip}-${device.mac || 'local'}`}
                  device={device}
                  selected={selectedIp === device.ip}
                  onSelect={(next) => setSelectedIp(next.ip)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="min-h-0 overflow-auto rounded-xl border border-neutral-800 bg-neutral-950/60 p-4" data-testid="network-device-details">
          <h3 className="text-sm font-semibold">Device details</h3>

          {selectedDevice ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Selected</div>
                <div className="mt-1 text-xl font-semibold">{formatDeviceName(selectedDevice)}</div>
                <div className="mt-1 text-sm text-neutral-400">{KIND_LABELS[selectedDevice.kind] || selectedDevice.kind}</div>
              </div>

              <dl className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">IP Address</dt>
                  <dd className="mt-1 font-mono text-sm">{selectedDevice.ip}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">MAC Address</dt>
                  <dd className="mt-1 font-mono text-sm">{selectedDevice.mac || 'not visible'}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Hostname</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.hostname || 'not resolved'}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Source</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.source}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">ARP Type</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.arpType || 'n/a'}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Last Seen</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.lastSeen ? new Date(selectedDevice.lastSeen).toLocaleString() : 'unknown'}</dd>
                </div>
              </dl>

              <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
                <div className="font-semibold">Operator note</div>
                <p className="mt-1 text-amber-100/80">
                  This v0 does not fingerprint vendors or open ports. Unknown devices are candidates for labeling later, not proof of compromise.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
              Select a discovered device to inspect it.
            </div>
          )}

          <div className="mt-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="text-sm font-semibold">Local interfaces</div>
            <div className="mt-3 space-y-2">
              {(inventory?.interfaces ?? []).map((iface) => (
                <div key={`${iface.name}-${iface.ip}`} className="rounded-lg bg-neutral-950 p-3 text-sm">
                  <div className="font-medium">{iface.name}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-400">{iface.ip} / {iface.netmask}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-500">{iface.mac || 'no mac'} · {iface.cidr}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
