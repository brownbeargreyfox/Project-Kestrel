// src/plugins/aida/views/ManualAssetSimulationPresets.jsx
//
// Human-triggered local simulation presets for manual AIDA assets. These do not
// scan, discover, ping, install agents, or run in the background.

import React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import {
  MANUAL_ASSET_SIMULATION_PRESETS,
  buildManualAssetPresetPayload,
} from './manualAssetsPanelHelpers';

export default function ManualAssetSimulationPresets({ asset, onApplied }) {
  const [busyPreset, setBusyPreset] = React.useState(null);
  const [error, setError] = React.useState(null);

  const applyPreset = async (presetId) => {
    setBusyPreset(presetId);
    setError(null);
    try {
      const res = await fetch(`/api/aida/assets/manual/${encodeURIComponent(asset.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildManualAssetPresetPayload(asset, presetId)),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Failed to apply preset (HTTP ${res.status})`);
      await onApplied?.(data.asset);
    } catch (err) {
      setError(err?.message ?? 'Failed to apply manual asset preset');
    } finally {
      setBusyPreset(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3" data-testid="manual-asset-presets">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        Manual simulation presets
      </div>
      {error && (
        <div className="mb-2 rounded border border-red-900 bg-red-950/50 p-2 text-xs text-red-200" role="alert">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {MANUAL_ASSET_SIMULATION_PRESETS.map((preset) => {
          const isRestore = preset.id === 'restore-online';
          const Icon = isRestore ? RotateCcw : Play;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              disabled={busyPreset !== null}
              title={preset.description}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs disabled:opacity-50 ${
                isRestore
                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50'
                  : 'border-amber-800 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50'
              }`}
              data-testid="manual-asset-preset"
            >
              <Icon size={13} /> {busyPreset === preset.id ? 'Applying…' : preset.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-[11px] text-neutral-600">
        Human-triggered only. Saved through the manual asset update path and recorded in MAIA.
      </div>
    </div>
  );
}
