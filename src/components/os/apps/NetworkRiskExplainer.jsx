import React from 'react';
import { AlertCircle, Loader, ShieldAlert } from 'lucide-react';

function Explainer({ result }) {
  if (!result) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <h4 className="text-sm font-semibold text-neutral-200">Evidence</h4>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          {result.evidence.mac && (
            <div className="text-xs">
              <span className="text-neutral-500">MAC:</span> <span className="font-mono">{result.evidence.mac}</span>
            </div>
          )}
          {result.evidence.hostname && (
            <div className="text-xs">
              <span className="text-neutral-500">Hostname:</span> <span>{result.evidence.hostname}</span>
            </div>
          )}
          {result.evidence.vendor && (
            <div className="text-xs">
              <span className="text-neutral-500">Vendor:</span> <span>{result.evidence.vendor}</span>
            </div>
          )}
          {result.evidence.trustState && result.evidence.trustState !== 'unknown' && (
            <div className="text-xs">
              <span className="text-neutral-500">Trust:</span> <span className="uppercase">{result.evidence.trustState}</span>
            </div>
          )}
          {result.evidence.tags?.length > 0 && (
            <div className="text-xs md:col-span-2">
              <span className="text-neutral-500">Tags:</span> {result.evidence.tags.join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <h4 className="text-sm font-semibold text-neutral-200">Confidence Inputs</h4>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-neutral-500">Evidence Confidence:</dt>
            <dd className="font-semibold">{Math.round(result.confidenceInputs.evidenceConfidence)}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Missing Evidence Penalty:</dt>
            <dd className="font-semibold">{Math.round(result.confidenceInputs.missingEvidencePenalty)}%</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-neutral-500">Risk Signals Found:</dt>
            <dd className="font-semibold">{result.confidenceInputs.riskSignalCount}</dd>
          </div>
        </dl>
      </div>

      {result.counterpoints?.length > 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <h4 className="text-sm font-semibold text-neutral-200">Counterpoints</h4>
          <ul className="mt-2 space-y-1 text-xs text-neutral-300">
            {result.counterpoints.map((point) => (
              <li key={point} className="list-disc pl-4">
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.recommendedChecks?.length > 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <h4 className="text-sm font-semibold text-neutral-200">Recommended Checks</h4>
          <ol className="mt-2 space-y-1 text-xs text-neutral-300">
            {result.recommendedChecks.map((check, idx) => (
              <li key={check} className="list-decimal pl-4">
                {check}
              </li>
            ))}
          </ol>
        </div>
      )}

      {result.brokerRequest && (
        <details className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-200">
            AI Model Input (deterministic, not executed)
          </summary>
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-neutral-500">
              The prompt below would be sent to the local AI broker if you clicked "Explain with AI." No model has been called yet.
            </p>
            <details className="rounded bg-neutral-900 p-2">
              <summary className="cursor-pointer text-neutral-400">View full prompt</summary>
              <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-neutral-400">
                {result.brokerRequest.body?.prompt || 'No prompt available'}
              </pre>
            </details>
            <div className="rounded bg-neutral-900 p-2 text-neutral-400">
              <div className="font-mono text-[11px]">
                Provider: <span className="text-sky-300">{result.brokerRequest.body?.provider}</span>
              </div>
              <div className="font-mono text-[11px]">
                Timeout: <span className="text-sky-300">{result.brokerRequest.body?.timeoutMs}ms</span>
              </div>
              <div className="font-mono text-[11px]">
                Temperature: <span className="text-sky-300">{result.brokerRequest.body?.temperature}</span>
              </div>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

export default function NetworkRiskExplainer({ device, onExplain }) {
  const [explaining, setExplaining] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);

  const handleExplain = React.useCallback(async () => {
    if (!device?.deviceKey) return;

    setExplaining(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/network-risk/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `Explain risk failed with HTTP ${response.status}`);
      }

      setResult(payload);
      if (onExplain) onExplain(payload);
    } catch (err) {
      setError(err?.message ?? 'Failed to explain network risk');
    } finally {
      setExplaining(false);
    }
  }, [device, onExplain]);

  React.useEffect(() => {
    setResult(null);
    setError(null);
  }, [device?.deviceKey]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleExplain}
          disabled={!device || explaining}
          aria-busy={explaining}
          aria-label={explaining ? 'Analyzing device risk...' : 'Explain risk for this device'}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-700 bg-sky-950/70 px-3 py-2 text-sm text-sky-100 hover:bg-sky-900 disabled:opacity-50"
          data-testid="network-explain-risk"
        >
          {explaining && <Loader size={16} className="animate-spin motion-reduce:animate-none" />}
          {explaining ? 'Analyzing…' : 'Explain Risk'}
        </button>
        {result && <span className="text-xs text-emerald-300">Analysis complete</span>}
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
          <AlertCircle size={16} className="shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {!result && !error && !explaining && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-400">
          <div className="flex gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <div>Select "Explain Risk" to analyze this device with evidence-based reasoning.</div>
          </div>
        </div>
      )}

      {result && <Explainer result={result} />}
    </div>
  );
}
