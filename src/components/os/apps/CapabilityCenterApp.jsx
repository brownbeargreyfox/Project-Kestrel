// src/components/os/apps/CapabilityCenterApp.jsx

import React from 'react';
import { CheckCircle2, GitBranch, KeyRound, ListChecks, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import AssetMemoryContext from './AssetMemoryContext';

const RISK_CLASSES = {
  low:      'border-emerald-800 bg-emerald-950/70 text-emerald-200',
  medium:   'border-amber-800 bg-amber-950/70 text-amber-200',
  high:     'border-orange-800 bg-orange-950/70 text-orange-200',
  critical: 'border-red-800 bg-red-950/70 text-red-200',
};

const SEVERITY_CLASSES = {
  critical: 'border-red-800 bg-red-950/70 text-red-200',
  high:     'border-orange-800 bg-orange-950/70 text-orange-200',
  medium:   'border-amber-800 bg-amber-950/70 text-amber-200',
  low:      'border-emerald-800 bg-emerald-950/70 text-emerald-200',
};

const STATUS_CLASSES = {
  'pending-review': 'border-amber-800 bg-amber-950/50 text-amber-200',
  'approved':       'border-emerald-800 bg-emerald-950/50 text-emerald-200',
  'rejected':       'border-red-800 bg-red-950/50 text-red-200',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function RejectModal({ intent, note, onNoteChange, onConfirm, onCancel, busy }) {
  const textareaRef = React.useRef(null);
  React.useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleKey = (e) => {
    if (e.key === 'Escape') onCancel();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onKeyDown={handleKey}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl">
        <div className="border-b border-neutral-800 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-neutral-100">Reject intent</div>
              <div className="mt-0.5 text-sm text-neutral-400 line-clamp-2">{intent.title}</div>
            </div>
            <button onClick={onCancel} className="text-xl leading-none text-neutral-500 hover:text-neutral-300">×</button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-neutral-400">
            Rejection reason is recorded in the audit log. Optional, but helpful for future review.
          </p>
          <textarea
            ref={textareaRef}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Reason for rejection (optional)…"
            rows={3}
            className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <div className="text-[11px] text-neutral-600">Ctrl+Enter to confirm · Esc to cancel</div>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-800 p-4">
          <button
            onClick={onCancel} disabled={busy}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm} disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/60 px-4 py-2 text-sm text-red-200 hover:bg-red-900/60 disabled:opacity-50"
          >
            {busy ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CapabilityCenterApp() {
  const [capabilityPayload, setCapabilityPayload] = React.useState(null);
  const [auditPayload, setAuditPayload] = React.useState(null);
  const [intentPayload, setIntentPayload] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [pendingReject, setPendingReject] = React.useState(null); // { intent } | null
  const [rejectNote, setRejectNote] = React.useState('');

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

  React.useEffect(() => { loadState(); }, [loadState]);

  // Refresh intent list when AIDA accepts a recommendation and creates a new intent
  React.useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('intent.created', () => {
      fetch('/api/capabilities/intents/recent?limit=25')
        .then((r) => r.json())
        .then((d) => { if (d.ok) setIntentPayload(d); })
        .catch(() => {});
    });
    return () => es.close();
  }, []);

  const approveIntent = async (intentId) => {
    setBusyId(intentId);
    setNotice(null);
    try {
      const res = await fetch(`/api/capabilities/intents/${intentId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Approve failed');
      setIntentPayload((prev) => ({
        ...prev,
        intents: prev.intents.map((i) => i.id === intentId ? data.intent : i),
      }));
      setNotice({ type: 'ok', text: 'Intent approved.' });
    } catch (err) {
      setNotice({ type: 'err', text: err?.message ?? 'Approve failed' });
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (intent) => {
    setPendingReject({ intent });
    setRejectNote('');
  };

  const confirmReject = async () => {
    if (!pendingReject) return;
    const { intent } = pendingReject;
    setBusyId(intent.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/capabilities/intents/${intent.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: rejectNote }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Reject failed');
      setIntentPayload((prev) => ({
        ...prev,
        intents: prev.intents.map((i) => i.id === intent.id ? data.intent : i),
      }));
      setPendingReject(null);
      setNotice({ type: 'ok', text: 'Intent rejected.' });
    } catch (err) {
      setNotice({ type: 'err', text: err?.message ?? 'Reject failed' });
      setPendingReject(null);
    } finally {
      setBusyId(null);
    }
  };

  const capabilities = capabilityPayload?.capabilities ?? [];
  const auditEvents  = auditPayload?.events ?? [];
  const intents      = intentPayload?.intents ?? [];
  const pending      = intents.filter((i) => i.status === 'pending-review');

  // Group capabilities by category for a clearer control-plane overview.
  const capabilityGroups = React.useMemo(() => {
    const groups = new Map();
    for (const capability of capabilities) {
      const key = capability.category || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(capability);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [capabilities]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="capability-center-app">
      {pendingReject && (
        <RejectModal
          intent={pendingReject.intent}
          note={rejectNote}
          onNoteChange={setRejectNote}
          onConfirm={confirmReject}
          onCancel={() => setPendingReject(null)}
          busy={busyId === pendingReject.intent.id}
        />
      )}

      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-emerald-300" size={20} />
              <h2 className="text-lg font-semibold">Capability Center</h2>
              {pending.length > 0 && (
                <span className="rounded-full border border-amber-800 bg-amber-950/50 px-2 py-0.5 text-[11px] text-amber-200">
                  {pending.length} pending
                </span>
              )}
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
      {notice && (
        <div className={`mx-4 mt-4 rounded-lg border p-3 text-sm ${notice.type === 'ok' ? 'border-emerald-900 bg-emerald-950/40 text-emerald-200' : 'border-red-900 bg-red-950/40 text-red-200'}`}>
          {notice.text}
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

          <div className="space-y-4">
            {capabilityGroups.map(([category, items]) => (
              <div key={category}>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {category}
                  <span className="rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] font-normal text-neutral-500">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((capability) => (
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
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold">
            <ListChecks size={17} />
            Action intents
            <span className="ml-auto text-xs text-neutral-500">{intents.length} shown</span>
          </div>

          {intents.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">
              No action intents yet. Accept an AIDA recommendation to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {intents.map((intent) => {
                const isPending = intent.status === 'pending-review';
                return (
                  <div
                    key={intent.id}
                    className={`rounded-lg border p-3 ${isPending ? 'border-amber-900/60 bg-amber-950/20' : 'border-neutral-800 bg-neutral-950'}`}
                    data-testid={`intent-${intent.id}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium">{intent.title}</div>
                        <div className="mt-0.5 font-mono text-xs text-neutral-500">{intent.capability}</div>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLASSES[intent.status] || 'border-neutral-700 text-neutral-300'}`}>
                        {intent.status}
                      </span>
                    </div>
                    {intent.detail && <div className="mt-2 text-sm text-neutral-400">{intent.detail}</div>}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {intent.origin === 'aida' && (
                        <span className="rounded border border-sky-900 bg-sky-950/30 px-1.5 py-0.5 text-sky-300">AIDA</span>
                      )}
                      {intent.severity && (
                        <span className={`rounded-full border px-1.5 py-0.5 text-[11px] ${SEVERITY_CLASSES[intent.severity] || SEVERITY_CLASSES.low}`}>
                          {intent.severity}
                        </span>
                      )}
                      <span>{intent.actor} · {formatDate(intent.ts)}</span>
                    </div>

                    {/* Lineage — where this intent came from and how it resolved */}
                    {(intent.recommendationId || intent.assetId || intent.resolvedBy) && (
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-neutral-800/70 bg-neutral-900/40 px-2 py-1 text-[11px] text-neutral-500">
                        <span className="inline-flex items-center gap-1 text-neutral-400"><GitBranch size={11} /> Lineage</span>
                        {intent.origin && <span>origin: {intent.origin}</span>}
                        {intent.recommendationId && <span className="font-mono">rec {String(intent.recommendationId).slice(0, 8)}</span>}
                        {intent.assetId && <span className="font-mono">asset {String(intent.assetId).slice(0, 8)}</span>}
                        {intent.resolvedBy && (
                          <span className="text-neutral-400">→ {intent.status} by {intent.resolvedBy} · {formatDate(intent.resolvedAt)}</span>
                        )}
                      </div>
                    )}

                    {intent.resolutionNote && (
                      <div className="mt-1 text-xs text-neutral-500">Note: {intent.resolutionNote}</div>
                    )}

                    {/* Read-only MAIA memory for this asset (interpretation, not automation) */}
                    {intent.assetId && (
                      <AssetMemoryContext assetId={intent.assetId} assetName={intent.assetName} />
                    )}

                    {isPending && (
                      <div className="mt-3 flex items-center gap-2 border-t border-neutral-800 pt-3">
                        <button
                          onClick={() => approveIntent(intent.id)}
                          disabled={busyId === intent.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/50 disabled:opacity-50"
                          data-testid={`approve-${intent.id}`}
                        >
                          <CheckCircle2 size={13} /> Approve
                        </button>
                        <button
                          onClick={() => openReject(intent)}
                          disabled={busyId === intent.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                          data-testid={`reject-${intent.id}`}
                        >
                          <XCircle size={13} /> Reject
                        </button>
                        <span className="ml-auto font-mono text-[11px] text-neutral-600">{intent.id?.slice(0, 8)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
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
