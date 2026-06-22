// src/components/os/apps/NetworkRiskExplainerPanel.tsx
//
// Deterministic Network Risk Explainer panel (issue #15).
// Owns only orchestration: the Explain Risk action, request state, and the
// empty/ready/loading/success/degraded/error state machine. Rendering lives in
// ./NetworkRiskExplainerSections and the network/field logic in
// ./networkRiskExplainerHelpers.
//
// Read-only. No model/broker/provider is ever invoked here — the panel only
// triggers the deterministic POST and displays what the backend assembled.
// No remediation or workflow actions.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { explainDeviceRisk } from './networkRiskExplainerHelpers';
import type { ExplainResponse, Json } from './networkRiskExplainerHelpers';
import { ResultBody } from './NetworkRiskExplainerSections';

export interface NetworkRiskExplainerPanelProps {
  device: Json | null;
  onExplain?: (result: ExplainResponse) => void;
}

export default function NetworkRiskExplainerPanel({
  device,
  onExplain,
}: NetworkRiskExplainerPanelProps) {
  const [explaining, setExplaining] = useState(false);
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExplain = useCallback(async () => {
    if (!device) return;
    setExplaining(true);
    setError(null);
    setResult(null);
    try {
      const payload = await explainDeviceRisk(device);
      setResult(payload);
      onExplain?.(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to explain network risk');
    } finally {
      setExplaining(false);
    }
  }, [device, onExplain]);

  // Reset to the Ready/Empty state whenever the selected device changes.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [device?.deviceKey, device?.ip]);

  return (
    <div className="space-y-3" data-testid="network-risk-explainer">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleExplain}
          disabled={!device || explaining}
          aria-busy={explaining}
          aria-label={explaining ? 'Analyzing device risk' : 'Explain risk for the selected device'}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-700 bg-sky-950/70 px-3 py-2 text-sm text-sky-100 hover:bg-sky-900 disabled:opacity-50"
          data-testid="network-explain-risk"
        >
          {explaining && <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" />}
          {explaining ? 'Analyzing…' : 'Explain Risk'}
        </button>
        {result && <span className="text-xs text-emerald-300">Analysis complete</span>}
      </div>

      {/* Empty: no device selected */}
      {!device && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          Select a device in the inventory to enable risk explanation.
        </div>
      )}

      {/* Error: failed request, with Retry */}
      {error && (
        <div
          className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200"
          data-testid="network-risk-error"
          role="alert"
        >
          <div className="flex gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <div className="flex-1">{error}</div>
          </div>
          <button
            type="button"
            onClick={handleExplain}
            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-700 bg-red-950/70 px-3 py-1.5 text-xs text-red-100 hover:bg-red-900"
            data-testid="network-risk-retry"
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {/* Ready: device selected but not explained yet */}
      {device && !result && !error && !explaining && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          <div className="flex gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <div>Click "Explain Risk" to assemble deterministic evidence for this device.</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {explaining && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          Assembling deterministic network evidence…
        </div>
      )}

      {/* Success / partial */}
      {result && device && <ResultBody result={result} device={device} />}
    </div>
  );
}
