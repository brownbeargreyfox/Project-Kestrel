// src/plugins/aida/hooks/useAIDABridge.ts
//
// REST + SSE adapter that populates useAIDAStore from the existing server
// endpoints — no WebSocket server required.
//
// Data flow:
//   /api/aida/observe         → assets
//   /api/aida/recommendations → risks (engine recs translated to Risk type)
//   /api/telemetry/mode       → authoritative LIVE/MOCK flag
//   /api/events (SSE)         → telemetry.update triggers a debounced refresh
//
// Concurrency guards:
//   - refreshInFlight: drops duplicate calls while one is already in-flight
//   - debounceTimer:   coalesces rapid SSE bursts into a single refresh (800ms)
//
// Governance: reads only. Never posts on behalf of the operator.

import { useEffect } from 'react';
import { useAIDAStore } from '../store/useAIDAStore';
import type { Risk, AIDAAsset, AIDAEvent } from '../../../types/aida';

// ── server-shape types (internal to this module) ──────────────────────────────

interface ServerRec {
  id:              string;
  ruleId:          string;
  assetId:         string;
  assetName:       string;
  severity:        string;
  title:           string;
  rationale:       string;
  dataSources:     string[];
  assumptions:     string[];
  estimatedImpact: { blastRadius: number; currentRisk: number };
  confidence:      { value: number };
  dependencies:    Array<{ id: string }>;
  suggestedAction: string;
  generatedAt:     number;
}

interface ServerAsset {
  id:         string;
  name:       string;
  type:       string;
  status:     string;
  risk:       number;
  datacenter?: string;
  tier?:       string;
  metrics?:    Record<string, unknown>;
}

// ── mapping tables ────────────────────────────────────────────────────────────

const RULE_TYPE: Record<string, Risk['type']> = {
  'memory-exhaustion': 'anomaly',
  'cpu-overload':      'cascade',
  'cache-miss-storm':  'cascade',
  'slow-query':        'slo',
  'critical-status':   'cascade',
  'elevated-risk':     'prediction',
};

const SEVERITY_TTI: Record<string, { p10: number; p50: number; p90: number }> = {
  critical: { p10: 0.5, p50: 2,  p90: 6  },
  high:     { p10: 3,   p50: 8,  p90: 18 },
  medium:   { p10: 12,  p50: 18, p90: 36 },
  low:      { p10: 24,  p50: 48, p90: 96 },
};

// ── translators ───────────────────────────────────────────────────────────────

function recToRisk(rec: ServerRec): Risk {
  const sev = rec.severity;
  const riskSev: Risk['severity'] = sev === 'critical' ? 'high' : (sev as Risk['severity']) ?? 'medium';
  const eta = SEVERITY_TTI[sev] ?? SEVERITY_TTI['medium']!;
  return {
    id:           rec.id,
    type:         RULE_TYPE[rec.ruleId] ?? 'anomaly',
    severity:     riskSev,
    probability:  Math.min(0.95, rec.estimatedImpact.currentRisk * 0.9 + 0.1),
    confidence:   rec.confidence.value,
    timeToImpact: eta.p50,
    eta,
    title:        rec.title,
    description:  rec.rationale,
    affected:     [rec.assetId, ...rec.dependencies.map((d) => d.id)],
    blastRadius:  rec.estimatedImpact.blastRadius,
    mitigation:   rec.suggestedAction,
    model:        'aida-engine-v1.0',
    explain:      [...rec.dataSources, ...rec.assumptions].join(' · '),
    state:        'active',
    suppressions: [],
    createdAt:    new Date(rec.generatedAt).toISOString(),
    updatedAt:    new Date().toISOString(),
  };
}

function serverAssetToStore(a: ServerAsset): AIDAAsset {
  return {
    id:     a.id,
    name:   a.name,
    type:   a.type,
    status: a.status,
    risk:   a.risk,
    ...(a.datacenter !== undefined && { datacenter: a.datacenter }),
    ...(a.tier       !== undefined && { tier:       a.tier       }),
    ...(a.metrics    !== undefined && { metrics:    a.metrics    }),
  };
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useAIDABridge(): void {
  useEffect(() => {
    let alive = true;
    let refreshInFlight = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const {
      setConnectionState, setLastError, setServerTime, setDataMode,
      setAssets, upsertRisks, markRisksSeen, pushToast, ingestEvent,
    } = useAIDAStore.getState();

    setConnectionState('connecting');

    async function refresh(): Promise<void> {
      if (refreshInFlight || !alive) return;
      refreshInFlight = true;
      try {
        const [obsRes, recRes, modeRes] = await Promise.all([
          fetch('/api/aida/observe'),
          fetch('/api/aida/recommendations'),
          fetch('/api/telemetry/mode'),
        ]);

        if (!alive) return;

        if (!obsRes.ok || !recRes.ok) {
          setConnectionState('error');
          setLastError(`Server error: observe=${obsRes.status} recs=${recRes.status}`);
          return;
        }

        const obsJson  = (await obsRes.json())  as { observation: { assets: ServerAsset[] } };
        const recJson  = (await recRes.json())  as { recommendations: ServerRec[] };
        const modeJson = (await modeRes.json().catch(() => null)) as { mode?: string } | null;

        if (!alive) return;

        // Assets
        const assets = obsJson.observation.assets ?? [];
        setAssets(assets.map(serverAssetToStore));

        // Data mode — authoritative source is /api/telemetry/mode (hasRealData())
        if (modeJson?.mode === 'live' || modeJson?.mode === 'mock') {
          setDataMode(modeJson.mode);
        }

        // Risks
        const recs  = recJson.recommendations ?? [];
        const risks = recs.map(recToRisk);

        // Detect new risk IDs before upserting (for toast notifications)
        const { seenRiskIds } = useAIDAStore.getState();
        const newRisks = risks.filter((r) => !(r.id in seenRiskIds));

        upsertRisks(risks);
        markRisksSeen(risks.map((r) => r.id));

        for (const r of newRisks) {
          pushToast({ riskId: r.id, title: r.title, severity: r.severity, ts: Date.now() });
        }

        setConnectionState('connected');
        setLastError(null);
        setServerTime(new Date().toISOString());
      } catch (err) {
        if (!alive) return;
        setConnectionState('error');
        setLastError(err instanceof Error ? err.message : 'Bridge fetch failed');
      } finally {
        refreshInFlight = false;
      }
    }

    // Debounced trigger — coalesces rapid SSE bursts into one refresh
    function scheduleRefresh(): void {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void refresh();
      }, 800);
    }

    const sse = new EventSource('/api/events');

    sse.onopen = () => {
      if (alive) void refresh();
    };

    sse.addEventListener('telemetry.update', () => {
      if (!alive) return;
      const ev: AIDAEvent = {
        id:      `sse-${Date.now()}`,
        type:    'telemetry.update',
        ts:      Date.now(),
        source:  'server',
        payload: {},
      };
      ingestEvent(ev);
      scheduleRefresh();
    });

    sse.onerror = () => {
      if (alive) {
        setConnectionState('error');
        setLastError('SSE connection lost — retrying…');
      }
    };

    // Initial fetch; SSE open may not fire immediately on all browsers
    void refresh();

    return () => {
      alive = false;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      sse.close();
    };
  }, []);
}
