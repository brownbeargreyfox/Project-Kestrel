// src/plugins/aida/views/ManualAssetsPanel.jsx
//
// Manage local-only manual AIDA assets from the cockpit instead of PowerShell.
// UI-only on top of the existing /api/aida/assets/manual endpoints — no scanning,
// pinging, discovery, agents, or background polling. State stays local under
// .kestrel/manual-assets.json (backend-owned).
//
// Feature flags respected (via VITE_* env):
//   VITE_FF_WORKFLOW_ACTIONS = 'true' — show add/edit/delete/preset controls

import React from 'react';
import { Server, RefreshCw, Trash2, Pencil } from 'lucide-react';
import ManualAssetAddForm from './ManualAssetAddForm';
import ManualAssetEditor from './ManualAssetEditor';
import ManualAssetMemoryContext from './ManualAssetMemoryContext';
import ManualAssetSimulationPresets from './ManualAssetSimulationPresets';

const FF_WORKFLOW_ACTIONS = import.meta.env['VITE_FF_WORKFLOW_ACTIONS'] === 'true';

export default function ManualAssetsPanel() {
  const [assets, setAssets] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);

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

  const remove = async (asset) => {
    if (!FF_WORKFLOW_ACTIONS) return;
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

      {!FF_WORKFLOW_ACTIONS && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-500" data-testid="manual-assets-actions-disabled">
          Manual asset actions are hidden. Enable VITE_FF_WORKFLOW_ACTIONS to add, edit, delete, or apply presets.
        </div>
      )}

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
                  {FF_WORKFLOW_ACTIONS && (
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
                  )}
                </div>
                {FF_WORKFLOW_ACTIONS && editingId === asset.id && <ManualAssetEditor asset={asset} onCancel={() => setEditingId(null)} onSaved={onSaved} />}
                {FF_WORKFLOW_ACTIONS && <ManualAssetSimulationPresets asset={asset} onApplied={load} />}
                <ManualAssetMemoryContext assetId={asset.id} assetName={asset.name} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {FF_WORKFLOW_ACTIONS && <ManualAssetAddForm onAdded={load} onError={setError} />}
    </section>
  );
}
