// src/plugins/aida/views/AIDASentinelWorkspace.jsx
//
// AIDA Sentinel — operator cockpit for the sentinel-class advisory system.
// Five pillars: Observe / Recommend / Memory / Simulate / Reflect

import React from 'react';
import {
  Activity, Brain, Eye, Lightbulb, History, RefreshCw, ShieldAlert,
  CheckCircle2, XCircle, GitBranch, FlaskConical, Gauge, Wand2,
  PlayCircle, ArrowRightLeft,
} from 'lucide-react';
import { useMAIAStore } from '../../../store/useMAIAStore';
import MAIAMemoryPanel from './MAIAMemoryPanel';
import ManualAssetsPanel from './ManualAssetsPanel';
import AssetMemoryContext from '../../../components/os/apps/AssetMemoryContext';

const SEVERITY_CLASSES = {
  critical: 'border-red-800 bg-red-950/70 text-red-200',
  high:     'border-orange-800 bg-orange-950/70 text-orange-200',
  medium:   'border-amber-800 bg-amber-950/70 text-amber-200',
  low:      'border-emerald-800 bg-emerald-950/70 text-emerald-200',
};

const STATUS_DOT = {
  online: 'bg-emerald-400', warning: 'bg-amber-400',
  critical: 'bg-red-500', offline: 'bg-red-600', maintenance: 'bg-sky-400',
};

const SCENARIOS = [
  { key: 'restart',    label: 'Controlled restart',  description: 'Reclaim leaked memory, clear incident. Brief downtime.' },
  { key: 'scale-out', label: 'Scale out tier',       description: 'Add capacity to share load — reduces pressure on this node.' },
  { key: 'drain',     label: 'Drain & maintenance',  description: 'Gracefully remove from rotation, reducing downstream pressure.' },
  { key: 'patch',     label: 'Patch & recycle',      description: 'Apply pending patches then restart — resolves software-level incidents.' },
];

const PILLARS = [
  { id: 'observe',    label: 'Observe',    icon: Eye },
  { id: 'recommend',  label: 'Recommend',  icon: Lightbulb },
  { id: 'simulate',   label: 'Simulate',   icon: PlayCircle },
  { id: 'memory',     label: 'Memory',     icon: Brain },
  { id: 'reflect',    label: 'Reflect',    icon: History },
];

function pct(n) { return `${Number(n || 0).toFixed(1)}%`; }
function fmt(v) { return typeof v === 'number' ? (v > 0 ? `+${v}` : `${v}`) : v; }
function formatDate(value) { if (!value) return '—'; return new Date(value).toLocaleString(); }

function RiskBar({ value }) {
  const v = Math.round((value || 0) * 100);
  const color = v >= 75 ? 'bg-red-500' : v >= 50 ? 'bg-orange-400' : v >= 30 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
      <div className={`h-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

function ConfidenceRange({ confidence }) {
  if (!confidence) return null;
  const lo = Math.round(confidence.low * 100);
  const hi = Math.round(confidence.high * 100);
  const mid = Math.round(confidence.value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>Confidence</span>
        <span className="font-mono text-neutral-200">{mid}% <span className="text-neutral-500">({lo}–{hi}%)</span></span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-neutral-800">
        <div className="absolute h-full rounded-full bg-sky-500/40" style={{ left: `${lo}%`, width: `${Math.max(2, hi - lo)}%` }} />
        <div className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-sky-300" style={{ left: `${mid}%` }} />
      </div>
      {confidence.lowCoverage && <div className="text-[11px] text-amber-300/90">⚠ Low historical coverage — wider uncertainty.</div>}
    </div>
  );
}

function HealthStat({ icon: Icon, label, value, tone }) {
  const toneClass = { ok: 'text-emerald-300', warn: 'text-amber-300', crit: 'text-red-300', neutral: 'text-sky-300' }[tone] || 'text-neutral-300';
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center gap-2 text-xs text-neutral-400"><Icon size={14} className={toneClass} /> {label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Empty({ children }) {
  return <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 text-sm text-neutral-400">{children}</div>;
}

function DeltaBadge({ value, unit = '%', invert = false }) {
  if (value == null) return null;
  const positive = invert ? value < 0 : value > 0;
  const cls = positive ? 'text-emerald-300' : value === 0 ? 'text-neutral-400' : 'text-red-300';
  return <span className={`font-mono text-sm font-semibold ${cls}`}>{fmt(value)}{unit}</span>;
}

// Inline dismiss modal — avoids window.prompt, keeps focus in the UI
function DismissModal({ rec, reason, onReasonChange, onConfirm, onCancel, busy }) {
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
              <div className="font-semibold text-neutral-100">Dismiss recommendation</div>
              <div className="mt-0.5 text-sm text-neutral-400 line-clamp-2">{rec.title}</div>
            </div>
            <button onClick={onCancel} className="text-xl leading-none text-neutral-500 hover:text-neutral-300">×</button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs text-neutral-400">
            Dismissal is recorded as a reflection signal and refines future recommendations.
            A reason helps AIDA learn faster, but is optional.
          </p>
          <textarea
            ref={textareaRef}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Reason for dismissal (optional)…"
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
            {busy ? 'Dismissing…' : 'Dismiss'}
          </button>
        </div>
      </div>
    </div>
  );
}

// AI Narrative sub-component — lazy, per-recommendation
function NarrativeButton({ recId }) {
  const [state, setState] = React.useState('idle'); // idle | loading | done | error | unavailable
  const [text, setText] = React.useState(null);

  const fetch_ = async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/aida/recommendations/${recId}/narrate`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Narration failed');
      if (data.brokerStatus === 'unavailable') {
        setState('unavailable');
        setText(data.message);
      } else {
        setState('done');
        setText(data.narrative);
      }
    } catch (err) {
      setState('error');
      setText(err?.message ?? 'Narration failed');
    }
  };

  if (state === 'idle') {
    return (
      <button
        onClick={fetch_}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-900 bg-sky-950/40 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-900/40"
        title="Get AI-generated narrative via Ollama"
      >
        <Wand2 size={13} /> Get AI narrative
      </button>
    );
  }

  if (state === 'loading') {
    return <span className="text-xs text-neutral-500 italic">Generating narrative…</span>;
  }

  return (
    <div className="mt-2 rounded-lg border border-sky-900/40 bg-sky-950/20 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-sky-300">
          {state === 'unavailable' ? '⚠ AI broker unavailable' : state === 'error' ? '✕ Error' : '✦ AIDA narrative'}
        </span>
        <button onClick={() => setState('idle')} className="text-[11px] text-neutral-500 hover:text-neutral-300">dismiss</button>
      </div>
      <p className={`text-xs whitespace-pre-wrap leading-relaxed ${state === 'done' ? 'text-sky-100' : 'text-amber-200/80'}`}>{text}</p>
    </div>
  );
}

export default function AIDASentinelWorkspace() {
  const [pillar, setPillar] = React.useState('observe');
  const [observation, setObservation] = React.useState(null);
  const [recs, setRecs] = React.useState([]);
  const [reflections, setReflections] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [dataMode, setDataMode] = React.useState(null); // { mode, agentCount, message }
  const [pendingDismiss, setPendingDismiss] = React.useState(null); // { rec, reason }

  // Simulate pillar state
  const [simAssetId, setSimAssetId] = React.useState('');
  const [simScenario, setSimScenario] = React.useState('restart');
  const [simResult, setSimResult] = React.useState(null);
  const [simLoading, setSimLoading] = React.useState(false);
  const [simError, setSimError] = React.useState(null);

  const recommendationLog = useMAIAStore((s) => s.recommendationLog);
  const insightMemory     = useMAIAStore((s) => s.insightMemory);
  const debateLog         = useMAIAStore((s) => s.debateLog);
  const pushRecommendation = useMAIAStore((s) => s.pushRecommendation);
  const pushInsight        = useMAIAStore((s) => s.pushInsight);
  const addDebateEntry     = useMAIAStore((s) => s.addDebateEntry);

  const loadAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [obsRes, recRes, refRes, modeRes] = await Promise.all([
        fetch('/api/aida/observe'),
        fetch('/api/aida/recommendations'),
        fetch('/api/aida/reflections?limit=25'),
        fetch('/api/telemetry/mode'),
      ]);
      const obs  = await obsRes.json();
      const rec  = await recRes.json();
      const ref  = await refRes.json();
      const mode = await modeRes.json().catch(() => null);
      if (!obsRes.ok || !obs.ok) throw new Error(obs.error || 'Failed to load observation');
      if (!recRes.ok || !rec.ok) throw new Error(rec.error || 'Failed to load recommendations');
      if (!refRes.ok || !ref.ok) throw new Error(ref.error || 'Failed to load reflections');
      setObservation(obs.observation);
      setRecs(rec.recommendations || []);
      setReflections(ref.reflections || []);
      if (mode?.ok) setDataMode(mode);
      // Seed the asset picker with the top at-risk asset
      if (!simAssetId && obs.observation?.atRisk?.length) {
        setSimAssetId(obs.observation.atRisk[0].id);
      }
      if (obs.observation?.atRisk?.length) {
        const top = obs.observation.atRisk[0];
        pushInsight({
          id: `insight:${top.id}:${obs.observation.generatedAt}`,
          ts: Date.now(),
          summary: `${top.name} is the highest-priority asset (risk ${Math.round(top.risk * 100)}%, ${top.status}).`,
          assetId: top.id,
          source: 'aida.observe',
        });
      }
    } catch (err) {
      setError(err?.message ?? 'Failed to load AIDA');
    } finally {
      setLoading(false);
    }
  }, [pushInsight, simAssetId]);

  React.useEffect(() => { loadAll(); }, [loadAll]);

  // Subscribe to SSE telemetry.update so the Observe pillar refreshes automatically
  // when a real agent reports without requiring a manual refresh click.
  React.useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('telemetry.update', () => {
      // Only auto-refresh Observe to avoid disrupting in-progress interactions
      fetch('/api/aida/observe')
        .then((r) => r.json())
        .then((d) => { if (d.ok) setObservation(d.observation); })
        .catch(() => {});
      fetch('/api/telemetry/mode')
        .then((r) => r.json())
        .then((d) => { if (d.ok) setDataMode(d); })
        .catch(() => {});
    });
    return () => es.close();
  }, []);

  const acceptRec = async (rec) => {
    setBusyId(rec.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/aida/recommendations/${rec.id}/accept`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: '' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Accept failed');
      pushRecommendation({
        id: rec.id, ts: Date.now(), decision: 'accepted',
        title: rec.title, severity: rec.severity,
        intentId: data.intent?.id, confidence: rec.confidence,
      });
      addDebateEntry({
        ts: Date.now(), actor: 'operator', action: 'accepted',
        text: `Accepted "${rec.title}" → pending approval as intent ${data.intent?.id?.slice(0, 8)}.`,
      });
      setNotice({ type: 'ok', text: data.message });
      setRecs((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      setNotice({ type: 'err', text: err?.message ?? 'Accept failed' });
    } finally { setBusyId(null); }
  };

  const dismissRec = (rec) => {
    setPendingDismiss({ rec, reason: '' });
  };

  const confirmDismiss = async () => {
    if (!pendingDismiss) return;
    const { rec, reason } = pendingDismiss;
    setBusyId(rec.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/aida/recommendations/${rec.id}/dismiss`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Dismiss failed');
      addDebateEntry({
        ts: Date.now(), actor: 'operator', action: 'dismissed',
        text: `Dismissed "${rec.title}": ${reason || 'no reason'}.`,
      });
      setReflections((prev) => [data.reflection, ...prev]);
      setRecs((prev) => prev.filter((r) => r.id !== rec.id));
      setPendingDismiss(null);
      setNotice({ type: 'ok', text: 'Dismissed — recorded as a reflection signal.' });
    } catch (err) {
      setNotice({ type: 'err', text: err?.message ?? 'Dismiss failed' });
      setPendingDismiss(null);
    } finally { setBusyId(null); }
  };

  const runSimulation = async () => {
    if (!simAssetId) return;
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    try {
      const res = await fetch('/api/aida/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: simAssetId, scenario: simScenario }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Simulation failed');
      setSimResult(data);
      addDebateEntry({
        ts: Date.now(), actor: 'aida', action: 'simulated',
        text: `Simulated "${data.scenario.label}" on ${data.asset.name} → risk delta ${data.delta.riskReduction}%, health +${data.delta.healthImprovement}%.`,
      });
    } catch (err) {
      setSimError(err?.message ?? 'Simulation failed');
    } finally { setSimLoading(false); }
  };

  const health = observation?.systemHealth;
  const allAssets = observation?.assets ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-100" data-testid="aida-sentinel-app">
      {pendingDismiss && (
        <DismissModal
          rec={pendingDismiss.rec}
          reason={pendingDismiss.reason}
          onReasonChange={(r) => setPendingDismiss((prev) => prev && { ...prev, reason: r })}
          onConfirm={confirmDismiss}
          onCancel={() => setPendingDismiss(null)}
          busy={busyId === pendingDismiss.rec.id}
        />
      )}
      <header className="border-b border-neutral-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="text-sky-300" size={20} />
              <h2 className="text-lg font-semibold">AIDA Sentinel</h2>
              <span className="rounded-full border border-sky-900 bg-sky-950/60 px-2 py-0.5 text-[11px] text-sky-200">
                Adaptive Infrastructure Decision Assistant
              </span>
            </div>
            <p className="mt-1 text-sm text-neutral-400">Observes, simulates, and recommends — you remain in control.</p>
          </div>
          <button
            type="button" onClick={loadAll} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-50"
            data-testid="aida-refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            Refresh
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} />
            Advisory only · Human-in-the-loop · No autonomous action. Accept creates a pending intent requiring approval.
          </div>
          {dataMode && (
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${dataMode.mode === 'live' ? 'border-emerald-800 bg-emerald-950/60 text-emerald-200' : 'border-neutral-700 bg-neutral-900 text-neutral-400'}`}>
              {dataMode.mode === 'live' ? `● LIVE · ${dataMode.agentCount} agent${dataMode.agentCount !== 1 ? 's' : ''}` : '○ MOCK DATA'}
            </span>
          )}
        </div>

        <nav className="mt-3 flex flex-wrap gap-1" data-testid="aida-pillars">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            const active = pillar === p.id;
            return (
              <button key={p.id} onClick={() => setPillar(p.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border ${active ? 'border-sky-700 bg-sky-950/60 text-sky-100' : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'}`}
                data-testid={`aida-pillar-${p.id}`}
              >
                <Icon size={15} />
                {p.label}
                {p.id === 'recommend' && recs.length > 0 && (
                  <span className="rounded-full bg-sky-800 px-1.5 text-[11px] text-sky-100">{recs.length}</span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      {error && <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{error}</div>}
      {notice && (
        <div className={`mx-4 mt-4 rounded-lg border p-3 text-sm ${notice.type === 'ok' ? 'border-emerald-900 bg-emerald-950/40 text-emerald-200' : 'border-red-900 bg-red-950/40 text-red-200'}`}>
          {notice.text}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-4">

        {/* ======================= OBSERVE ======================= */}
        {pillar === 'observe' && (
          <div className="space-y-4" data-testid="aida-observe">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <HealthStat icon={Activity}    label="Assets"   value={health?.totalAssets ?? '—'} tone="neutral" />
              <HealthStat icon={Gauge}       label="Healthy"  value={health ? pct(health.healthyPct) : '—'} tone="ok" />
              <HealthStat icon={ShieldAlert} label="Warning"  value={health ? pct(health.warningPct) : '—'} tone="warn" />
              <HealthStat icon={XCircle}     label="Critical" value={health ? pct(health.criticalPct) : '—'} tone="crit" />
            </div>
            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold"><Eye size={17} /> At-risk assets</div>
                <span className="text-xs text-neutral-500">
                  {observation?.atRiskCount ?? 0} of {observation?.assetCount ?? 0} · avg risk {Math.round((health?.avgRisk || 0) * 100)}%
                </span>
              </div>
              {!observation?.atRisk?.length ? (
                <Empty>No assets currently above the risk threshold.</Empty>
              ) : (
                <div className="space-y-2">
                  {observation.atRisk.map((a) => (
                    <div key={a.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[a.status] || 'bg-neutral-500'}`} />
                            <span className="font-medium">{a.name}</span>
                            <span className="font-mono text-xs text-neutral-500">{a.type}</span>
                          </div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {a.datacenterName} · {a.tier} · criticality {a.criticality}
                            {a.incident && <span className="text-amber-300/90"> · incident: {a.incident.type}</span>}
                          </div>
                        </div>
                        <span className="font-mono text-sm text-neutral-200">risk {Math.round(a.risk * 100)}%</span>
                      </div>
                      <div className="mt-2"><RiskBar value={a.risk} /></div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(a.signals || []).map((s) => (
                          <span key={s.key} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400">{s.label}</span>
                        ))}
                      </div>
                      <AssetMemoryContext assetId={a.id} assetName={a.name} title="Prior MAIA decisions for this asset" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <ManualAssetsPanel />
          </div>
        )}

        {/* ======================= RECOMMEND ======================= */}
        {pillar === 'recommend' && (
          <div className="space-y-3" data-testid="aida-recommend">
            {recs.length === 0 ? (
              <Empty>No open recommendations. AIDA surfaces ranked options here when signals warrant action.</Empty>
            ) : (
              recs.map((rec) => (
                <article key={rec.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid={`aida-rec-${rec.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${SEVERITY_CLASSES[rec.severity] || SEVERITY_CLASSES.low}`}>{rec.severity}</span>
                        <h3 className="font-semibold">{rec.title}</h3>
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">{rec.assetName} · {rec.datacenter}</div>
                    </div>
                  </div>

                  <p className="mt-2 text-sm text-neutral-300">{rec.rationale}</p>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs">
                      <div className="mb-1 flex items-center gap-1.5 font-medium text-neutral-300"><GitBranch size={13} /> Estimated impact</div>
                      <div className="text-neutral-400">{rec.estimatedImpact.label} · ~{rec.estimatedImpact.riskReductionPct}% risk reduction</div>
                      <div className="mt-1 text-neutral-400">Blast radius: <span className="text-neutral-200">{rec.estimatedImpact.blastRadius}</span> dependent asset(s)</div>
                      {rec.dependencies?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rec.dependencies.map((d) => (
                            <span key={d.id} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400">{d.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <ConfidenceRange confidence={rec.confidence} />
                      <div className="mt-1.5 text-[11px] text-neutral-500">{rec.confidence?.basis}</div>
                    </div>
                  </div>

                  <details className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-neutral-300">Why AIDA suggests this (assumptions & sources)</summary>
                    <div className="mt-2 space-y-2 text-xs text-neutral-400">
                      <div>
                        <div className="font-medium text-neutral-300">Assumptions</div>
                        <ul className="ml-4 list-disc">{rec.assumptions?.map((a, i) => <li key={i}>{a}</li>)}</ul>
                      </div>
                      <div>
                        <div className="font-medium text-neutral-300">Data sources</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rec.dataSources?.map((s, i) => (
                            <span key={i} className="rounded border border-neutral-800 bg-neutral-900 px-1.5 py-0.5 font-mono text-[11px]">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>

                  {/* AI Narrative — lazy, per-recommendation */}
                  <div className="mt-3">
                    <NarrativeButton recId={rec.id} />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={() => acceptRec(rec)} disabled={busyId === rec.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/60 px-3 py-1.5 text-sm text-emerald-200 hover:bg-emerald-900/60 disabled:opacity-50"
                    >
                      <CheckCircle2 size={15} /> Accept → request approval
                    </button>
                    <button
                      onClick={() => dismissRec(rec)} disabled={busyId === rec.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <XCircle size={15} /> Dismiss
                    </button>
                    <span className="ml-auto font-mono text-[11px] text-neutral-600">{rec.suggestedCapability}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        )}

        {/* ======================= SIMULATE ======================= */}
        {pillar === 'simulate' && (
          <div className="space-y-4" data-testid="aida-simulate">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <PlayCircle size={17} /> What-if scenario planner
                <span className="ml-auto rounded-full border border-amber-900/60 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-200/90">
                  model before meddle · no changes made
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">Asset to model</label>
                  <select
                    value={simAssetId}
                    onChange={(e) => { setSimAssetId(e.target.value); setSimResult(null); }}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
                  >
                    {allAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.type}) · risk {Math.round(a.risk * 100)}%</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-neutral-400">Scenario</label>
                  <select
                    value={simScenario}
                    onChange={(e) => { setSimScenario(e.target.value); setSimResult(null); }}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
                  >
                    {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <p className="mt-2 text-xs text-neutral-500">
                {SCENARIOS.find((s) => s.key === simScenario)?.description}
              </p>

              <button
                onClick={runSimulation} disabled={simLoading || !simAssetId}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-800 bg-sky-950/50 px-4 py-2 text-sm text-sky-200 hover:bg-sky-900/50 disabled:opacity-50"
              >
                <PlayCircle size={15} className={simLoading ? 'animate-pulse' : ''} />
                {simLoading ? 'Projecting…' : 'Run simulation'}
              </button>
            </div>

            {simError && <div className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">{simError}</div>}

            {simResult && (
              <div className="space-y-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <ArrowRightLeft size={16} className="text-sky-300" />
                    Projected outcome: <span className="text-sky-200">{simResult.scenario.label}</span> on <span className="text-neutral-200">{simResult.asset.name}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="mb-1 text-[11px] text-neutral-500">Risk reduction</div>
                      <DeltaBadge value={simResult.delta.riskReduction} unit="%" invert={false} />
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="mb-1 text-[11px] text-neutral-500">System health</div>
                      <DeltaBadge value={simResult.delta.healthImprovement} unit="%" invert={false} />
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="mb-1 text-[11px] text-neutral-500">Cascade risk</div>
                      <DeltaBadge value={simResult.delta.cascadeRiskReduction} unit="%" invert={false} />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="mb-2 font-medium text-neutral-400">Before</div>
                      <div>Asset risk: <span className="text-neutral-200 font-mono">{Math.round(simResult.before.assetRisk * 100)}%</span></div>
                      <div className="mt-1">Status: <span className="text-neutral-200">{simResult.before.assetStatus}</span></div>
                      <div className="mt-1">System healthy: <span className="text-neutral-200 font-mono">{simResult.before.systemHealthyPct}%</span></div>
                      {simResult.before.activeRecommendation && (
                        <div className="mt-1 text-amber-300/80">Active rec: {simResult.before.activeRecommendation.severity}</div>
                      )}
                    </div>
                    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                      <div className="mb-2 font-medium text-neutral-400">After</div>
                      <div>Asset risk: <span className="text-emerald-300 font-mono">{Math.round(simResult.after.assetRisk * 100)}%</span></div>
                      <div className="mt-1">Status: <span className="text-emerald-300">{simResult.after.assetStatus}</span></div>
                      <div className="mt-1">System healthy: <span className="text-emerald-300 font-mono">{simResult.after.systemHealthyPct}%</span></div>
                      {simResult.before.dependentCount > 0 && (
                        <div className="mt-1 text-neutral-400">{simResult.before.dependentCount} dependent(s) modeled</div>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] text-neutral-600">{simResult.disclaimer}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================= MEMORY ======================= */}
        {pillar === 'memory' && (
          <div className="space-y-4" data-testid="aida-memory">
            {/* Durable, server-backed append-only memory (MAIA v0) */}
            <MAIAMemoryPanel />

            <div className="text-xs text-neutral-500">
              Local session memory (legacy · this browser only) — superseded by MAIA durable memory above.
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><Brain size={17} /> Decision log (MAIA)</div>
              {recommendationLog.length === 0 ? (
                <Empty>No decisions recorded yet. Accepted recommendations appear here.</Empty>
              ) : (
                <div className="space-y-2">
                  {[...recommendationLog].reverse().map((r, i) => (
                    <div key={`${r.id}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.title}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${SEVERITY_CLASSES[r.severity] || SEVERITY_CLASSES.low}`}>{r.decision}</span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {formatDate(r.ts)} {r.intentId && <>· intent {String(r.intentId).slice(0, 8)}</>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center gap-2 font-semibold"><History size={17} /> Insight & debate stream</div>
              {insightMemory.length === 0 && debateLog.length === 0 ? (
                <Empty>No insights captured yet.</Empty>
              ) : (
                <div className="space-y-2">
                  {[...insightMemory].reverse().slice(0, 8).map((ins, i) => (
                    <div key={`${ins.id}-${i}`} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
                      <div className="text-neutral-200">{ins.summary}</div>
                      <div className="mt-1 text-xs text-neutral-500">{ins.source} · {formatDate(ins.ts)}</div>
                    </div>
                  ))}
                  {[...debateLog].reverse().slice(0, 8).map((d, i) => (
                    <div key={`debate-${i}`} className="rounded-lg border border-neutral-800/60 bg-neutral-950/60 p-2.5 text-xs text-neutral-400">
                      <span className="font-medium text-neutral-300">{d.actor}</span> {d.text}
                    </div>
                  ))}
                </div>
              )}
            </section>
            </div>
          </div>
        )}

        {/* ======================= REFLECT ======================= */}
        {pillar === 'reflect' && (
          <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4" data-testid="aida-reflect">
            <div className="mb-3 flex items-center gap-2 font-semibold">
              <FlaskConical size={17} /> Reflection log
              <span className="ml-auto text-xs text-neutral-500">{reflections.length} signal(s)</span>
            </div>
            <p className="mb-3 text-xs text-neutral-500">
              Operator feedback is a first-class signal. Dismissals and outcomes refine future recommendations.
            </p>
            {reflections.length === 0 ? (
              <Empty>No reflection signals yet. Dismiss a recommendation with a reason to record one.</Empty>
            ) : (
              <div className="space-y-2">
                {reflections.map((r) => (
                  <div key={r.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{r.title}</span>
                      <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">{r.kind}</span>
                    </div>
                    <div className="mt-1 text-neutral-400">{r.reason}</div>
                    <div className="mt-1 text-xs text-neutral-500">{r.actor} · {formatDate(r.ts)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

      </main>
    </div>
  );
}
