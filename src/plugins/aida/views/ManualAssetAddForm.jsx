// src/plugins/aida/views/ManualAssetAddForm.jsx
//
// AIDA-local form for adding manual assets. Only rendered when workflow actions
// are enabled by the parent panel.

import React from 'react';
import { Server } from 'lucide-react';
import {
  DEFAULT_MANUAL_ASSET_FORM,
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

function Text({ id, label, value, onChange, placeholder }) {
  return (
    <label htmlFor={id} className="block text-xs text-neutral-400">
      <span className="mb-1 block">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 placeholder-neutral-600 focus:border-sky-600 focus:outline-none"
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

export default function ManualAssetAddForm({ onAdded, onError }) {
  const [form, setForm] = React.useState(DEFAULT_MANUAL_ASSET_FORM);
  const [submitting, setSubmitting] = React.useState(false);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMetric = (key, value) => setForm((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    if (!hasRequiredIdentity(form)) {
      onError?.('Provide at least an IP or a name to identify the asset.');
      return;
    }
    setSubmitting(true);
    onError?.(null);
    try {
      const res = await fetch('/api/aida/assets/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualAssetPayload(form)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to add manual asset (HTTP ${res.status})`);
      setForm(DEFAULT_MANUAL_ASSET_FORM);
      await onAdded?.(data.asset);
    } catch (err) {
      onError?.(err?.message ?? 'Failed to add manual asset');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="manual-assets-form">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Text id="ma-ip" label="IP (or provide a name)" value={form.ip} onChange={(v) => setField('ip', v)} placeholder="optional IPv4 address" />
        <Text id="ma-name" label="Name" value={form.name} onChange={(v) => setField('name', v)} placeholder="e.g. media-01" />
        <Text id="ma-os" label="OS" value={form.os} onChange={(v) => setField('os', v)} />
        <Text id="ma-type" label="Type" value={form.type} onChange={(v) => setField('type', v)} />
        <Text id="ma-datacenter" label="Datacenter" value={form.datacenter} onChange={(v) => setField('datacenter', v)} />
        <Select id="ma-tier" label="Tier" value={form.tier} onChange={(v) => setField('tier', v)} options={TIERS} />
        <Select id="ma-criticality" label="Criticality" value={form.criticality} onChange={(v) => setField('criticality', v)} options={CRITICALITIES} />
        <Select id="ma-status" label="Status" value={form.status} onChange={(v) => setField('status', v)} options={STATUSES} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {METRIC_FIELDS.map(({ key, label }) => {
          const [min, max] = METRIC_BOUNDS[key];
          return (
            <label key={key} htmlFor={`ma-${key}`} className="block text-xs text-neutral-400">
              <span className="mb-1 block">{label}</span>
              <input
                id={`ma-${key}`}
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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
          data-testid="manual-assets-submit"
        >
          <Server size={15} /> {submitting ? 'Adding…' : 'Add manual asset'}
        </button>
        <span className="text-[11px] text-neutral-600">Saved locally under .kestrel/manual-assets.json</span>
      </div>
    </form>
  );
}
