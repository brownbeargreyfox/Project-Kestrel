// src/plugins/aida/views/ManualAssetsPanel.jsx
//
// Manage local-only manual AIDA assets from the cockpit instead of PowerShell.
// UI-only on top of the existing /api/aida/assets/manual endpoints — no scanning,
// pinging, discovery, agents, or background polling. State stays local under
// .kestrel/manual-assets.json (backend-owned).

import React from 'react';
import { Server, RefreshCw, Trash2, Pencil } from 'lucide-react';
import ManualAssetEditor from './ManualAssetEditor';
import ManualAssetMemoryContext from './ManualAssetMemoryContext';
import ManualAssetSimulationPresets from './ManualAssetSimulationPresets';
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

export default function ManualAssetsPanel() {
  const [assets, setAssets] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [busyId, setBusyId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [form, setForm] = React.useState(DEFAULT_MANUAL_ASSET_FORM);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/aida/assets/manual');
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to load manual assets (HTTP ${res.status})`);
      setAssets(Array.isArray(data.assets) ? data.assets : []);
    } catch (err) {
      setError(err?.message ?? 'Failed to load manual assets');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setMetric = (key, value) => setForm((prev) => ({ ...prev, metrics: { ...prev.metrics, [key]: value } }));

  const submit = async (e) => {
    e.preventDefault();
    if (!hasRequiredIdentity(form)) {
      setError('Provide at least an IP or a name to identify the asset.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/aida/assets/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualAssetPayload(form)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to add manual asset (HTTP ${res.status})`);
      setForm(DEFAULT_MANUAL_ASSET_FORM);
      await load();
    } catch (err) {
      setError(err?.message ?? 'Failed to add manual asset');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (asset) => {
    setBusyId(asset.id);
    setError(null);
    try {
      const res = await fetch(`/api/aida/assets/manual/${encodeURIComponent(asset.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to delete manual asset (HTTP ${res.status})`);
      if (editingId === asset.id) setEditingId(null);
      await load();
    } catch (err) {
      setError(err?.message ?? 'Failed to delete manual asset');
    } finally {
      setBusyId(null);
    }
  };

  const onSaved = async () => {
    setEditingId(null);
    await load();
  };

  return (
    <section
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
      data-testid="manual-assets-panel"
      aria-label="Manual AIDA Assets"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <Server size={17} /> Manual AIDA Assets
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            Local-only assets that AIDA can observe and simulate before they run an agent.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
          data-testid="manual-assets-refresh"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="mt-3 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200"
          role="alert"
          data-testid="manual-assets-error"
        >
          <div>{error}</div>
          <button
            type="button"
            onClick={load}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      <div className="mt-3">
        {loading && assets.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
            Loading manual assets…
          </div>
        ) : assets.length === 0 ? (
          <div
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400"
            data-testid="manual-assets-empty"
          >
            No manual assets yet. Add one below to let AIDA observe and simulate it.
          </div>
        ) : (
          <ul className="space-y-2">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                data-testid="manual-assets-row"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-100">{asset.name}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {asset.ip ? `${asset.ip} · ` : ''}{asset.type} · {asset.datacenter} · {asset.tier} · {asset.criticality} · {asset.status}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId((current) => (current === asset.id ? null : asset.id))}
                      aria-expanded={editingId === asset.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                      data-testid="manual-assets-edit"
                    >
                      <Pencil size={13} /> {editingId === asset.id ? 'Close edit' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(asset)}
                      disabled={busyId === asset.id}
                      aria-label={`Delete manual asset ${asset.name}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-900 bg-red-950/40 px-2.5 py-1 text-xs text-red-200 hover:bg-red-900/50 disabled:opacity-50"
                      data-testid="manual-assets-delete"
                    >
                      <Trash2 size={13} /> {busyId === asset.id ? 'Removing…' : 'Delete'}
                    </button>
                  </div>
                </div>
                {editingId === asset.id && <ManualAssetEditor asset={asset} onCancel={() => setEditingId(null)} onSaved={onSaved} />}
                <ManualAssetSimulationPresets asset={asset} onApplied={load} />
                <ManualAssetMemoryContext assetId={asset.id} assetName={asset.name} />
              </li>
            ))}
          </ul>
        )}
      </div>

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
    </section>
  );
}
