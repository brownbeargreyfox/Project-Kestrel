// src/components/os/apps/DeviceReachabilityButton.jsx
//
// Operator-triggered reachability probe for a selected device. Gated behind the
// workflow-actions flag and the server-side gate. Reports "responded to ping" or
// "no response" only — never infers online/offline or changes any state.

import React from 'react';
import { Radio } from 'lucide-react';

const FF_WORKFLOW_ACTIONS = import.meta.env['VITE_FF_WORKFLOW_ACTIONS'] === 'true';

export default function DeviceReachabilityButton({ ip }) {
  const [probing, setProbing] = React.useState(false);
  const [result, setResult] = React.useState(null); // { responded, note } | null
  const [error, setError] = React.useState(null);

  React.useEffect(() => { setResult(null); setError(null); }, [ip]);

  const probe = React.useCallback(async () => {
    if (!ip) return;
    setProbing(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/network/reachability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const payload = await response.json();
      if (response.status === 403) throw new Error('Reachability probes are disabled (enable the workflow-actions flag).');
      if (response.status === 429) throw new Error('Too many probes — wait a moment and try again.');
      if (!response.ok || !payload.ok) throw new Error(payload.error || `Probe failed (HTTP ${response.status})`);
      setResult({ responded: Boolean(payload.responded), note: payload.note });
    } catch (err) {
      setError(err?.message ?? 'Reachability probe failed');
    } finally {
      setProbing(false);
    }
  }, [ip]);

  if (!FF_WORKFLOW_ACTIONS || !ip) return null;

  return (
    <div className="mt-3 border-t border-neutral-800 pt-3" data-testid="device-reachability">
      <button
        type="button"
        onClick={probe}
        disabled={probing}
        aria-busy={probing}
        className="inline-flex items-center gap-2 rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-900/50 disabled:opacity-50"
        data-testid="device-reachability-probe"
      >
        <Radio size={14} className={probing ? 'animate-pulse motion-reduce:animate-none' : ''} />
        {probing ? 'Probing…' : 'Check reachability'}
      </button>

      {result && (
        <div
          className={`mt-2 rounded-lg border p-2 text-xs ${result.responded ? 'border-emerald-900 bg-emerald-950/40 text-emerald-200' : 'border-amber-900/60 bg-amber-950/30 text-amber-200'}`}
          role="status"
          data-testid="device-reachability-result"
        >
          <div className="font-medium">{result.responded ? 'Responded to ping' : 'No response to ping'}</div>
          {result.note && <div className="mt-0.5 text-[11px] text-neutral-400">{result.note}</div>}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-red-900 bg-red-950/50 p-2 text-xs text-red-200" role="alert" data-testid="device-reachability-error">
          {error}
        </div>
      )}
    </div>
  );
}
