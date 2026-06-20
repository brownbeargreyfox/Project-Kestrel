// src/components/os/apps/NetworkTopologyApp.jsx

import React from 'react';
import {
  ExternalLink,
  Globe,
  Monitor,
  Radar,
  RefreshCw,
  Router,
  Save,
  ShieldAlert,
  Tags,
  Wifi,
} from 'lucide-react';

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

const TRUST_LABELS = {
  trusted: 'Trusted',
  unknown: 'Unknown',
  watch: 'Watch',
  blocked: 'Blocked label',
};

const TRUST_CLASSES = {
  trusted: 'border-emerald-800 bg-emerald-950/70 text-emerald-200',
  unknown: 'border-neutral-700 bg-neutral-900 text-neutral-300',
  watch: 'border-amber-800 bg-amber-950/70 text-amber-200',
  blocked: 'border-red-800 bg-red-950/70 text-red-200',
};

const KIND_OPTIONS = Object.keys(KIND_LABELS);
const TRUST_OPTIONS = Object.keys(TRUST_LABELS);

function formatDeviceName(device) {
  return device.displayName || device.label || device.hostname || device.mac || device.ip;
}

function formatDate(value) {
  if (!value) return 'not set';
  return new Date(value).toLocaleString();
}

function getKindIcon(kind) {
  if (kind === 'router/gateway') return Router;
  if (kind === 'this-host' || kind === 'computer') return Monitor;
  return Wifi;
}

function getDeviceScore(device) {
  let score = 0;
  if (device.isNew) score += 2;
  if (!device.hostname) score += 1;
  if (!device.mac) score += 1;
  if (device.kind === 'unknown' || device.kind === 'network-device') score += 1;
  if (device.trustState === 'unknown' || device.trustState === 'watch') score += 1;
  return score;
}

function parseTags(value) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function queryUrl(query) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function buildResearchLinks(device) {
  if (!device) return [];

  const name = formatDeviceName(device);
  const kind = KIND_LABELS[device.kind] || device.kind || 'network device';
  const macPrefix = device.macPrefix || device.mac?.split(':').slice(0, 3).join(':') || '';
  const hostname = device.hostname || '';
  const label = device.label || '';
  const tags = Array.isArray(device.tags) ? device.tags.join(' ') : '';

  const links = [
    {
      label: 'Search identity clues',
      description: 'Best first click: combines label, hostname, kind, and visible IDs.',
      url: queryUrl(`${label} ${hostname} ${kind} ${macPrefix} home network device`.trim()),
    },
    {
      label: 'Search MAC/OUI vendor',
      description: 'Uses the first three MAC octets to look for likely manufacturer information.',
      url: queryUrl(`${macPrefix || device.mac || device.ip} MAC OUI vendor`),
      disabled: !macPrefix && !device.mac,
    },
    {
      label: 'Search device type',
      description: 'Helps map the inferred kind to common home-network devices.',
      url: queryUrl(`${kind} ${hostname || label || tags} home network device type`.trim()),
    },
    {
      label: 'IEEE registry',
      description: 'Official public registration authority lookup for assigned identifiers.',
      url: 'https://regauth.standards.ieee.org/standards-ra-web/pub/view.html#registries',
    },
    {
      label: 'Wireshark OUI lookup',
      description: 'OUI lookup tool for vendor information from MAC prefixes.',
      url: 'https://www.wireshark.org/tools/oui-lookup.html',
    },
  ];

  return links.filter((link) => !link.disabled);
}

function DeviceCard({ device, selected, onSelect }) {
  const Icon = getKindIcon(device.kind);
  const score = getDeviceScore(device);
  const trustState = device.trustState || 'unknown';

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
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="truncate text-sm font-semibold text-neutral-100">{formatDeviceName(device)}</div>
              {device.isNew && (
                <span className="rounded-full border border-sky-700 bg-sky-950 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-200">
                  New
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-neutral-400">{device.ip}</div>
            <div className="mt-1 truncate text-xs text-neutral-500">{device.mac || 'No MAC visible'}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
            {KIND_LABELS[device.kind] || device.kind}
          </div>
          <div className={`rounded-full border px-2 py-0.5 text-[11px] ${TRUST_CLASSES[trustState] || TRUST_CLASSES.unknown}`}>
            {TRUST_LABELS[trustState] || trustState}
          </div>
        </div>
      </div>

      {device.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {device.tags.map((tag) => (
            <span key={tag} className="rounded bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300">#{tag}</span>
          ))}
        </div>
      )}

      {score > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
          <ShieldAlert size={14} />
          <span>{score} identity signal{score > 1 ? 's' : ''}</span>
        </div>
      )}
    </button>
  );
}

export default function NetworkTopologyApp() {
  const [inventory, setInventory] = React.useState(null);
  const [selectedIp, setSelectedIp] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [acknowledging, setAcknowledging] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [saveMessage, setSaveMessage] = React.useState('');
  const [labelDraft, setLabelDraft] = React.useState('');
  const [trustDraft, setTrustDraft] = React.useState('unknown');
  const [kindDraft, setKindDraft] = React.useState('network-device');
  const [notesDraft, setNotesDraft] = React.useState('');
  const [tagsDraft, setTagsDraft] = React.useState('');

  const selectedDevice = React.useMemo(() => {
    return inventory?.devices?.find((device) => device.ip === selectedIp) ?? null;
  }, [inventory, selectedIp]);

  React.useEffect(() => {
    if (!selectedDevice) return;
    setLabelDraft(selectedDevice.label || '');
    setTrustDraft(selectedDevice.trustState || 'unknown');
    setKindDraft(selectedDevice.kind || 'network-device');
    setNotesDraft(selectedDevice.notes || '');
    setTagsDraft((selectedDevice.tags || []).join(', '));
    setSaveMessage('');
  }, [selectedDevice?.deviceKey, selectedDevice?.ip]);

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

  const saveDeviceLabel = React.useCallback(async () => {
    if (!selectedDevice?.deviceKey) return;
    setSaving(true);
    setError(null);
    setSaveMessage('');

    try {
      const body = {
        key: selectedDevice.deviceKey,
        label: labelDraft,
        trustState: trustDraft,
        kind: kindDraft,
        notes: notesDraft,
        tags: parseTags(tagsDraft),
      };

      const response = await fetch('/api/network/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Label save failed with HTTP ${response.status}`);
      }

      const saved = payload.label ?? {
        label: '',
        trustState: 'unknown',
        kind: selectedDevice.kind,
        notes: '',
        tags: [],
        updatedAt: null,
      };

      setInventory((current) => {
        if (!current) return current;
        return {
          ...current,
          devices: current.devices.map((device) => {
            if (device.deviceKey !== selectedDevice.deviceKey) return device;
            const nextKind = saved.kind || device.kind;
            const nextLabel = saved.label || '';
            return {
              ...device,
              label: nextLabel,
              displayName: nextLabel || device.hostname || device.mac || device.ip,
              trustState: saved.trustState || 'unknown',
              kind: nextKind,
              notes: saved.notes || '',
              tags: Array.isArray(saved.tags) ? saved.tags : [],
              labelUpdatedAt: saved.updatedAt ?? null,
            };
          }),
        };
      });

      setSaveMessage('Saved');
    } catch (err) {
      setError(err?.message ?? 'Failed to save device label');
    } finally {
      setSaving(false);
    }
  }, [kindDraft, labelDraft, notesDraft, selectedDevice, tagsDraft, trustDraft]);

  const acknowledgeDevice = React.useCallback(async () => {
    if (!selectedDevice?.deviceKey) return;
    setAcknowledging(true);
    setError(null);
    setSaveMessage('');

    try {
      const response = await fetch('/api/network/devices/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: selectedDevice.deviceKey }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Acknowledge failed with HTTP ${response.status}`);
      }

      setInventory((current) => {
        if (!current) return current;
        return {
          ...current,
          newCount: Math.max(0, (current.newCount ?? 0) - 1),
          devices: current.devices.map((device) => (
            device.deviceKey === selectedDevice.deviceKey
              ? { ...device, isNew: false, acknowledgedAt: payload.acknowledgedAt }
              : device
          )),
        };
      });
      setSaveMessage('Acknowledged');
    } catch (err) {
      setError(err?.message ?? 'Failed to acknowledge device');
    } finally {
      setAcknowledging(false);
    }
  }, [selectedDevice]);

  const devices = inventory?.devices ?? [];
  const unknownCount = devices.filter((device) => getDeviceScore(device) > 0).length;
  const routerCount = devices.filter((device) => device.kind === 'router/gateway').length;
  const trustedCount = devices.filter((device) => device.trustState === 'trusted').length;
  const watchCount = devices.filter((device) => device.trustState === 'watch' || device.trustState === 'blocked').length;
  const newCount = devices.filter((device) => device.isNew).length;
  const researchLinks = buildResearchLinks(selectedDevice);

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
              Live local inventory with labels, first-seen tracking, and web cross-references for device identity.
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

      <section className="grid grid-cols-2 gap-3 border-b border-neutral-800 p-4 md:grid-cols-6">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Devices</div>
          <div className="mt-1 text-2xl font-semibold">{inventory?.count ?? '—'}</div>
        </div>
        <div className="rounded-lg border border-sky-900 bg-sky-950/40 p-3">
          <div className="text-xs uppercase tracking-wide text-sky-400">New</div>
          <div className="mt-1 text-2xl font-semibold">{newCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Trusted</div>
          <div className="mt-1 text-2xl font-semibold">{trustedCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Watch</div>
          <div className="mt-1 text-2xl font-semibold">{watchCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Identity Signals</div>
          <div className="mt-1 text-2xl font-semibold">{unknownCount}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Mode</div>
          <div className="mt-1 text-sm font-semibold">{inventory?.scanMode ?? 'loading'}</div>
          <div className="mt-1 text-xs text-neutral-500">{inventory?.elapsedMs ? `${inventory.elapsedMs}ms` : `${routerCount} router-ish`}</div>
        </div>
      </section>

      {error && (
        <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200" data-testid="network-inventory-error">
          {error}
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(340px,440px)_1fr]">
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Selected</div>
                    <div className="mt-1 text-xl font-semibold">{formatDeviceName(selectedDevice)}</div>
                  </div>
                  {selectedDevice.isNew && (
                    <button
                      type="button"
                      onClick={acknowledgeDevice}
                      disabled={acknowledging}
                      className="rounded-lg border border-sky-700 bg-sky-950 px-3 py-2 text-sm text-sky-100 hover:bg-sky-900 disabled:opacity-50"
                      data-testid="network-acknowledge-device"
                    >
                      {acknowledging ? 'Acknowledging…' : 'Acknowledge new'}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {selectedDevice.isNew && <span className="rounded-full border border-sky-700 bg-sky-950 px-2 py-1 text-sky-200">New device</span>}
                  <span className="rounded-full border border-neutral-700 px-2 py-1 text-neutral-300">{KIND_LABELS[selectedDevice.kind] || selectedDevice.kind}</span>
                  <span className={`rounded-full border px-2 py-1 ${TRUST_CLASSES[selectedDevice.trustState || 'unknown'] || TRUST_CLASSES.unknown}`}>
                    {TRUST_LABELS[selectedDevice.trustState || 'unknown']}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid="network-device-research">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ExternalLink size={16} />
                  Web cross-reference
                </div>
                <p className="mb-3 text-xs text-neutral-400">
                  These links open in your browser and use visible identity clues. Kestrel does not call those sites in the background.
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {researchLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm hover:border-sky-700 hover:bg-neutral-900"
                      data-testid={`network-research-${link.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    >
                      <div className="flex items-center justify-between gap-2 font-medium text-sky-200">
                        <span>{link.label}</span>
                        <ExternalLink size={14} />
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">{link.description}</div>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid="network-device-label-editor">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Tags size={16} />
                  Label this device
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Friendly name</span>
                    <input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      placeholder="Deco living room, PS5, garage camera…"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      data-testid="network-label-input"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Trust</span>
                    <select
                      value={trustDraft}
                      onChange={(e) => setTrustDraft(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      data-testid="network-trust-select"
                    >
                      {TRUST_OPTIONS.map((option) => (
                        <option key={option} value={option}>{TRUST_LABELS[option]}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Kind</span>
                    <select
                      value={kindDraft}
                      onChange={(e) => setKindDraft(e.target.value)}
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      data-testid="network-kind-select"
                    >
                      {KIND_OPTIONS.map((option) => (
                        <option key={option} value={option}>{KIND_LABELS[option]}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Tags</span>
                    <input
                      value={tagsDraft}
                      onChange={(e) => setTagsDraft(e.target.value)}
                      placeholder="iot, camera, kids, infra"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      data-testid="network-tags-input"
                    />
                  </label>

                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">Notes</span>
                    <textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Where it lives, who owns it, why it matters…"
                      className="min-h-20 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
                      data-testid="network-notes-input"
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={saveDeviceLabel}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-950/70 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-900 disabled:opacity-50"
                    data-testid="network-save-label"
                  >
                    <Save size={16} />
                    {saving ? 'Saving…' : 'Save label'}
                  </button>
                  {saveMessage && <span className="text-sm text-emerald-300">{saveMessage}</span>}
                </div>
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
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">MAC Prefix</dt>
                  <dd className="mt-1 font-mono text-sm">{selectedDevice.macPrefix || 'not visible'}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Hostname</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.hostname || 'not resolved'}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Device Key</dt>
                  <dd className="mt-1 break-all font-mono text-sm">{selectedDevice.deviceKey}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Seen Count</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.seenCount ?? 1}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">First Seen</dt>
                  <dd className="mt-1 text-sm">{formatDate(selectedDevice.firstSeen)}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Last Seen</dt>
                  <dd className="mt-1 text-sm">{formatDate(selectedDevice.lastSeen)}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Acknowledged</dt>
                  <dd className="mt-1 text-sm">{formatDate(selectedDevice.acknowledgedAt)}</dd>
                </div>
                <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Source</dt>
                  <dd className="mt-1 text-sm">{selectedDevice.source}</dd>
                </div>
              </dl>

              <div className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-4 text-sm text-amber-100">
                <div className="font-semibold">Operator note</div>
                <p className="mt-1 text-amber-100/80">
                  Web links are research shortcuts. Confirm identity with your router app, device admin page, or the physical device before trusting it.
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
