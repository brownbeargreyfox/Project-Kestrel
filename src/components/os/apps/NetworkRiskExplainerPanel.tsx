// src/components/os/apps/NetworkRiskExplainerPanel.tsx
//
// Deterministic Network Risk Explainer panel (issue #15).
// Wires the selected Network Inventory device to POST /api/network-risk/explain
// (the deterministic backend from PR #12) and renders the assembled evidence.
//
// Read-only. No model/broker/provider is ever invoked from this component — it
// only displays the broker *request preview* the backend returns, and states so
// explicitly. No remediation or workflow actions.

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, ServerCog, ShieldAlert } from 'lucide-react';

// ── types ─────────────────────────────────────────────────────────────────────
// The device object comes straight from Network Inventory; we keep it loose and
// read defensively so a degraded/partial response never crashes the panel.

type Json = Record<string, any>;

export interface ExplainResponse extends Json {
  ok?: boolean;
  evidence?: Json;
  confidenceInputs?: Json;
  counterpoints?: string[];
  recommendedChecks?: string[];
  operatorChecks?: string[];
  checks?: string[];
  brokerRequest?: Json;
  brokerRequestPreview?: Json;
}

// ── pure helper (unit-testable, fetch injectable) ──────────────────────────────

/**
 * POST the selected device to the deterministic explainer and return the payload.
 * Performs exactly one request. Throws on transport failure or a non-ok payload,
 * surfacing the server-provided error message when present.
 */
export async function explainDeviceRisk(
  device: Json,
  fetchImpl: typeof fetch = fetch,
): Promise<ExplainResponse> {
  const response = await fetchImpl('/api/network-risk/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device }),
  });

  let payload: ExplainResponse = {};
  try {
    payload = (await response.json()) as ExplainResponse;
  } catch {
    payload = {};
  }

  if (!response.ok || !payload || payload.ok === false) {
    throw new Error(
      (payload && payload.error) || `Explain risk failed with HTTP ${response.status}`,
    );
  }
  return payload;
}

// Tolerant field readers so renamed/missing backend fields degrade gracefully.
export function readChecks(result: ExplainResponse | null): string[] {
  if (!result) return [];
  const value = result.recommendedChecks ?? result.operatorChecks ?? result.checks;
  return Array.isArray(value) ? value : [];
}

export function readBrokerRequest(result: ExplainResponse | null): Json | null {
  if (!result) return null;
  return result.brokerRequest ?? result.brokerRequestPreview ?? null;
}

// ── small presentational helpers ───────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="text-xs">
      <span className="text-neutral-500">{label}:</span>{' '}
      <span className="text-neutral-200">{value}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <h4 className="text-sm font-semibold text-neutral-200">{title}</h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

// ── result body ────────────────────────────────────────────────────────────────

function ResultBody({ result, device }: { result: ExplainResponse; device: Json }) {
  const evidence: Json = result.evidence ?? {};
  const confidence: Json = result.confidenceInputs ?? {};
  const counterpoints: string[] = Array.isArray(result.counterpoints) ? result.counterpoints : [];
  const checks = readChecks(result);
  const broker = readBrokerRequest(result);
  const brokerBody: Json = (broker?.body as Json) ?? {};

  // Device Summary prefers server-normalized evidence, falling back to the raw
  // selected device so the section is always populated.
  const summary = {
    name:
      evidence.displayName ||
      evidence.hostname ||
      evidence.label ||
      device.displayName ||
      device.hostname ||
      device.mac ||
      device.ip ||
      'Selected device',
    ip: evidence.ip ?? device.ip,
    mac: evidence.mac ?? device.mac,
    kind: evidence.kind ?? device.kind,
    trustState: evidence.trustState ?? device.trustState,
  };

  const hasEvidenceFields = Boolean(
    evidence.mac ||
      evidence.hostname ||
      evidence.vendor ||
      (evidence.trustState && evidence.trustState !== 'unknown') ||
      (Array.isArray(evidence.tags) && evidence.tags.length > 0),
  );

  const hasConfidence =
    confidence.evidenceConfidence !== undefined ||
    confidence.missingEvidencePenalty !== undefined ||
    confidence.riskSignalCount !== undefined;

  const degraded =
    !result.evidence ||
    !result.confidenceInputs ||
    (!counterpoints.length && !checks.length && !broker);

  return (
    <div className="space-y-3" data-testid="network-risk-result">
      {degraded && (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-2 text-xs text-amber-200">
          Some sections were not returned by the explainer. Showing the available evidence.
        </div>
      )}

      {/* 1. Device Summary */}
      <Card title="Device Summary">
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          <Field label="Name" value={summary.name} />
          <Field label="IP" value={summary.ip} />
          <Field label="MAC" value={summary.mac} />
          <Field label="Kind" value={summary.kind} />
          <Field label="Trust" value={summary.trustState} />
        </div>
      </Card>

      {/* 2. Evidence */}
      <Card title="Evidence">
        <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
          {!hasEvidenceFields && (
            <div className="text-xs text-neutral-500 md:col-span-2">
              No identifying evidence available for this device.
            </div>
          )}
          <Field label="MAC" value={evidence.mac} />
          <Field label="Hostname" value={evidence.hostname} />
          <Field label="Vendor" value={evidence.vendor} />
          {evidence.trustState && evidence.trustState !== 'unknown' && (
            <Field label="Trust" value={String(evidence.trustState).toUpperCase()} />
          )}
          {Array.isArray(evidence.tags) && evidence.tags.length > 0 && (
            <div className="text-xs md:col-span-2">
              <span className="text-neutral-500">Tags:</span> {evidence.tags.join(', ')}
            </div>
          )}
        </div>
      </Card>

      {/* 3. Confidence Inputs */}
      <Card title="Confidence Inputs">
        {hasConfidence ? (
          <dl className="space-y-1 text-xs">
            {confidence.evidenceConfidence !== undefined && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Evidence Confidence</dt>
                <dd className="font-semibold text-neutral-200">
                  {Math.round(Number(confidence.evidenceConfidence))}%
                </dd>
              </div>
            )}
            {confidence.missingEvidencePenalty !== undefined && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Missing Evidence Penalty</dt>
                <dd className="font-semibold text-neutral-200">
                  {Math.round(Number(confidence.missingEvidencePenalty))}%
                </dd>
              </div>
            )}
            {confidence.riskSignalCount !== undefined && (
              <div className="flex justify-between">
                <dt className="text-neutral-500">Risk Signals Found</dt>
                <dd className="font-semibold text-neutral-200">{confidence.riskSignalCount}</dd>
              </div>
            )}
          </dl>
        ) : (
          <div className="text-xs text-neutral-500">No confidence inputs were returned.</div>
        )}
      </Card>

      {/* 4. Counterpoints */}
      <Card title="Counterpoints">
        {counterpoints.length > 0 ? (
          <ul className="space-y-1 text-xs text-neutral-300">
            {counterpoints.map((point) => (
              <li key={point} className="list-disc pl-4">
                {point}
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-neutral-500">No counterpoints were returned.</div>
        )}
      </Card>

      {/* 5. Operator Checks */}
      <Card title="Operator Checks">
        {checks.length > 0 ? (
          <ol className="space-y-1 text-xs text-neutral-300">
            {checks.map((check) => (
              <li key={check} className="list-decimal pl-4">
                {check}
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-xs text-neutral-500">No operator checks were returned.</div>
        )}
      </Card>

      {/* 6. Broker Request Preview */}
      <Card title="Broker Request Preview">
        {broker ? (
          <div className="space-y-2 text-xs">
            <p className="text-neutral-500">
              This is the request the backend assembled for a future local broker call. It was{' '}
              <span className="font-semibold text-neutral-300">not</span> sent.
            </p>
            <div className="rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-400">
              {broker.method && broker.path && (
                <div>
                  {broker.method} <span className="text-sky-300">{broker.path}</span>
                </div>
              )}
              {brokerBody.provider && (
                <div>
                  Provider: <span className="text-sky-300">{brokerBody.provider}</span>
                </div>
              )}
              {brokerBody.temperature !== undefined && (
                <div>
                  Temperature: <span className="text-sky-300">{brokerBody.temperature}</span>
                </div>
              )}
              {brokerBody.timeoutMs !== undefined && (
                <div>
                  Timeout: <span className="text-sky-300">{brokerBody.timeoutMs}ms</span>
                </div>
              )}
            </div>
            {brokerBody.prompt && (
              <details className="rounded bg-neutral-900 p-2">
                <summary className="cursor-pointer text-neutral-400">View assembled prompt</summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-400">
                  {brokerBody.prompt}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <div className="text-xs text-neutral-500">No broker request preview was returned.</div>
        )}
      </Card>

      {/* 7. Model Status */}
      <section
        className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3"
        data-testid="network-risk-model-status"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
          <ServerCog size={16} />
          Model Status: Not invoked
        </div>
        <p className="mt-1 text-xs text-emerald-100/80">
          This explainer only assembled deterministic network evidence. No AI model, broker, or
          external provider was called.
        </p>
      </section>
    </div>
  );
}

// ── panel ───────────────────────────────────────────────────────────────────────

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
