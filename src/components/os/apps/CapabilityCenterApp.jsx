// src/components/os/apps/CapabilityCenterApp.jsx

import React from 'react';
import { KeyRound, ListChecks, RefreshCw, ShieldCheck } from 'lucide-react';

const RISK_CLASSES = {
  low: 'border-emerald-800 bg-emerald-950/70 text-emerald-200',
  medium: 'border-amber-800 bg-amber-950/70 text-amber-200',
  high: 'border-orange-800 bg-orange-950/70 text-orange-200',
  critical: 'border-red-800 bg-red-950/70 text-red-200',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export default function CapabilityCenterApp() {
  const [capabilityPayload, setCapabilityPayload] = React.useState(null);
  const [auditPayload, setAuditPayload] = React.useState(null);
  const [intentPayload, setIntentPayload] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const loadState = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [capabilityResponse, auditResponse, intentResponse] = await Promise.all([
        fetch('/api/capabilities/capabilities'),
        fetch('/api/capabilities/audit/recent?limit=25'),
        fetch('/api/capabilities/intents/recent?limit=25'),
      ]);

      const capabilities = await capabilityResponse.json();
      const audit = await auditResponse.json();
      const intents = await intentResponse.json();

      if (!capabilityResponse.ok || !capabilities.ok) throw new Error(capabilities.error || 'Failed to load capabilities');
      if (!auditResponse.ok || !audit.ok) throw new Error(audit.error || 'Failed to load audit events');
      if (!intentResponse.ok || !intents.ok) throw new Error(intents.error || 'Failed to load action intents');

      setCapabilityPayload(capabilities);
      setAuditPayload(audit);
      setIntentPayload(intents);
    } catch (err) {
      setError(err?.message ?? 'Failed to load Capability Center');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadState();
  }, [loadState]);

  const capabilities = capabilityPayload?.capabilities ?? [];
  const auditEvents = auditPayload?.events ?? [];
  const intents = intentPayload?.intents ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="capability-center-app">
      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-300" size={20} />
              <h2 className="text-lg font-semibold">Capability Center</h2>
            </div>
            <p className="mt-1 text-sm text-neutral-400">
              Kestrel control-plane spine: capabilities, audit trail, and pending action intents.
            </p>
          </div>
          <button
            type="button"
            onClick={loadState}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
            data-testid="capability-center-refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200" data-testid="capability-center-error">
          {error}
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <KeyRound size={17} />
              Capabilities
            </div>
            <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
              {capabilityPayload?.mode || 'loading'}
            </span>
          </div>

          <div className="space-y-2">
            {capabilities.map((capability) => (
              <div key={capability.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm text-neutral-100">{capability.id}</div>
                    <div className="mt-1 text-sm text-neutral-400">{capability.title}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2 py-1 text-xs ${RISK_CLASSES[capability.risk] || RISK_CLASSES.low}`}>
                      {capability.risk}
                    </span>
                    <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
                      {capability.mode}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <ListChecks size={17} />
            Pending action intents
          </div>

          {intents.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
              No pending action intents yet.
            </div>
          ) : (
            <div className="space-y-2">
              {intents.map((intent) => (
                <div key={intent.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                  <div className="font-medium">{intent.title}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-500">{intent.capability}</div>
                  <div className="mt-2 text-sm text-neutral-400">{intent.detail || 'No detail provided.'}</div>
                  <div className="mt-2 text-xs text-neutral-500">{intent.status} · {formatDate(intent.ts)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="font-semibold">Recent audit events</div>
            <span className="text-xs text-neutral-500">{auditEvents.length} shown</span>
          </div>

          {auditEvents.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
              No audit events yet.
            </div>
          ) : (
            <div className="space-y-2">
              {auditEvents.map((event) => (
                <div key={event.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm text-neutral-100">{event.type}</div>
                      <div className="mt-1 text-sm text-neutral-400">{event.detail || 'No detail.'}</div>
                    </div>
                    <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                      {event.outcome}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">
                    {event.actor} · {event.capability || 'no capability'} · {formatDate(event.ts)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
