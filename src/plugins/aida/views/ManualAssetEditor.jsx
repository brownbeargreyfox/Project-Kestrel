// src/plugins/aida/views/ManualAssetEditor.jsx
//
// Small inline editor for local manual AIDA assets. Operator-driven only: no
// scanning, discovery, pinging, or background activity.

import React from 'react';
import { Save, X } from 'lucide-react';
import {
  METRIC_BOUNDS,
  buildManualAssetPayload,
  clampNumber,
  hasRequiredIdentity,
} from './manualAssetsPanelHelpers';

const TIERS = ['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid'];
const CRITICALITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['online', 'warning', 'critical', 'offline', 'maintenance'];

const METRIC_FIELDS = [
  { key: 'cpuUsage', label: 'CPU %' },
  { key: 'memoryUsage', label: 'Memory %' },
  { key: 'diskUsage', label: 'Disk %' },
  { key: 'networkLatency', label: 'Latency (ms)' },
  { key: 'storageIO', label: 'Storage IO' },
  { key: 'connections', label: 'Connections' },
];

function toForm(asset) {
  return {
    id: asset.id,
    ip: asset.ip || '',
    name: asset.name || '',
    os: asset.os || '',
    type: asset.type || 'server',
    datacenter: asset.datacenter || 'home-lab',
    tier: asset.tier || 'app-tier',
    criticality: asset.criticality || 'medium',
    status: asset.status || 'online',
    metrics: {
      cpuUsage: asset.metrics?.cpuUsage ?? 10,
      memoryUsage: asset.metrics?.memoryUsage ?? 20,
      diskUsage: asset.metrics?.diskUsage ?? 45,
      networkLatency: asset.metrics?.networkLatency ?? 8,
      storageIO: asset.metrics?.storageIO ?? 500,
      connections: asset.metrics?.connections ?? 12,
    },
  };
}

function Text({ id, label, value, onChange }) {
  return (
    <label htmlFor={id} className="block text-xs text-neutral-400">
      <span className="mb-1 block">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
      />
    </label>
  );
}

function Select({ id, label, value, onChange, options }) {
  return (
    <label htmlFor={id} className="block text-xs text-neutral-400">
      <span className="mb-1 block">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default function ManualAssetEditor({ asset, onCancel, onSaved }) {
  const [form, setForm] = React.useState(() => toForm(asset));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMetric = (key, value) => setForm((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    if (!hasRequiredIdentity(form)) {
      setError('Provide at least an IP or a name to identify the asset.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/aida/assets/manual/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualAssetPayload(form)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to update manual asset (HTTP ${res.status})`);
      await onSaved?.(data.asset);
    } catch (err) {
      setError(err?.message ?? 'Failed to update manual asset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3" data-testid="manual-asset-editor">
      {error && <div className="mb-3 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200" role="alert">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Text id={`edit-${asset.id}-ip`} label="IP" value={form.ip} onChange={(v) => setField('ip', v)} />
        <Text id={`edit-${asset.id}-name`} label="Name" value={form.name} onChange={(v) => setField('name', v)} />
        <Text id={`edit-${asset.id}-os`} label="OS" value={form.os} onChange={(v) => setField('os', v)} />
        <Text id={`edit-${asset.id}-type`} label="Type" value={form.type} onChange={(v) => setField('type', v)} />
        <Text id={`edit-${asset.id}-datacenter`} label="Datacenter" value={form.datacenter} onChange={(v) => setField('datacenter', v)} />
        <Select id={`edit-${asset.id}-tier`} label="Tier" value={form.tier} onChange={(v) => setField('tier', v)} options={TIERS} />
        <Select id={`edit-${asset.id}-criticality`} label="Criticality" value={form.criticality} onChange={(v) => setField('criticality', v)} options={CRITICALITIES} />
        <Select id={`edit-${asset.id}-status`} label="Status" value={form.status} onChange={(v) => setField('status', v)} options={STATUSES} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {METRIC_FIELDS.map(({ key, label }) => {
          const [min, max] = METRIC_BOUNDS[key];
          return (
            <label key={key} htmlFor={`edit-${asset.id}-${key}`} className="block text-xs text-neutral-400">
              <span className="mb-1 block">{label}</span>
              <input
                id={`edit-${asset.id}-${key}`}
                type="number"
                min={min}
                max={max}
                value={form.metrics[key]}
                onChange={(e) => setMetric(key, e.target.value)}
                onBlur={(e) => setMetric(key, clampNumber(e.target.value, min, max))}
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-sky-600 focus:outline-none"
              />
            </label>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50" data-testid="manual-asset-save">
          <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50">
          <X size={13} /> Cancel
        </button>
      </div>
    </form>
  );
}
