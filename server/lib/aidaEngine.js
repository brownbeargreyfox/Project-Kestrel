// server/lib/aidaEngine.js
//
// AIDA reasoning core — Observation + Recommendation pillars of the
// AIDA Constitution, implemented server-side so the Traceable Insight Chain
// (logged, timestamped, versioned) is authoritative and auditable.
//
// Constitutional guarantees encoded here:
//   * "Model before meddle"   -> deterministic, explainable reasoning
//   * "Guide, don't govern"   -> recommendations only; never executes
//   * "Explainable Reasoning" -> every recommendation carries data sources,
//                                model assumptions, confidence as an
//                                uncertainty RANGE (per MAIA constitution),
//                                and dependency / blast-radius context

import crypto from 'node:crypto';

const ENGINE_VERSION = '1.0.0';

// Tier ordering within a datacenter — faults low in the stack (data/app)
// endanger everything that depends on them.
const TIER_ORDER = ['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid'];

const STATUS_WEIGHT = {
  offline: 1.0,
  critical: 0.9,
  warning: 0.5,
  maintenance: 0.15,
  online: 0.0,
};

const CRITICALITY_WEIGHT = {
  critical: 1.0,
  high: 0.8,
  medium: 0.6,
  low: 0.4,
};

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function round(v, places = 2) {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function stableId(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

// ---------------------------------------------------------------------------
// Observation pillar — "No action without awareness."
// ---------------------------------------------------------------------------

function scoreAsset(server, serverTypeIndex) {
  const metrics = server.metrics || {};
  const typeInfo = serverTypeIndex.get(server.type) || {};
  // server.criticality may be a level string set directly by liveState for real agents
  const criticalityLevel = typeInfo.criticalityLevel || server.criticality || 'medium';
  const criticality = CRITICALITY_WEIGHT[criticalityLevel] ?? 0.6;

  const cpu = Number(metrics.cpuUsage) || 0;
  const mem = Number(metrics.memoryUsage) || 0;
  const latency = Number(metrics.networkLatency) || 0;
  const disk = Number(metrics.diskUsage) || 0;
  const statusWeight = STATUS_WEIGHT[server.status] ?? 0.3;

  const signals = [];
  signals.push({ key: 'status', label: `Status: ${server.status}`, value: server.status, weight: round(statusWeight) });

  const cpuContribution = cpu > 85 ? 1 : cpu / 100;
  signals.push({ key: 'cpu', label: `CPU ${Math.round(cpu)}%`, value: round(cpu), weight: round(cpuContribution) });

  const memContribution = mem > 90 ? 1 : mem / 100;
  signals.push({ key: 'memory', label: `Memory ${Math.round(mem)}%`, value: round(mem), weight: round(memContribution) });

  const latContribution = latency > 300 ? 1 : latency / 300;
  signals.push({ key: 'latency', label: `Latency ${Math.round(latency)}ms`, value: round(latency), weight: round(latContribution) });

  if (server.currentIncident) {
    signals.push({
      key: 'incident',
      label: `Active incident: ${server.currentIncident.type}`,
      value: server.currentIncident.type,
      weight: 0.6,
    });
  }

  let raw =
    0.34 * statusWeight +
    0.24 * memContribution +
    0.24 * cpuContribution +
    0.13 * latContribution +
    0.05 * (disk > 85 ? 1 : disk / 100);

  if (server.currentIncident) raw += 0.12;

  const risk = clamp01(raw);
  const priority = clamp01(0.65 * risk + 0.35 * (risk > 0 ? criticality : 0));

  return { risk: round(risk), priority: round(priority), criticality: criticalityLevel, criticalityWeight: criticality, signals };
}

export function buildObservation(data = {}) {
  const servers = Array.isArray(data.serverOverview) ? data.serverOverview : [];
  const serverTypes = Array.isArray(data.serverTypes) ? data.serverTypes : [];
  const datacenters = Array.isArray(data.datacenters) ? data.datacenters : [];
  const serverTypeIndex = new Map(serverTypes.map((t) => [t.type, t]));
  const dcIndex = new Map(datacenters.map((d) => [d.id, d]));

  const assets = servers.map((server) => {
    const scored = scoreAsset(server, serverTypeIndex);
    return {
      id: server.id,
      name: server.name,
      type: server.type,
      tier: server.tier,
      datacenter: server.datacenter,
      datacenterName: dcIndex.get(server.datacenter)?.name || server.datacenter,
      region: server.region,
      status: server.status,
      environment: server.environment,
      complianceZone: server.complianceZone,
      metrics: server.metrics,
      incident: server.currentIncident
        ? { type: server.currentIncident.type, description: server.currentIncident.description, severity: server.currentIncident.severity }
        : null,
      ...scored,
    };
  });

  const statusCounts = assets.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const total = assets.length || 1;

  const systemHealth = {
    totalAssets: assets.length,
    healthyPct: round(((statusCounts.online || 0) / total) * 100, 1),
    warningPct: round(((statusCounts.warning || 0) / total) * 100, 1),
    criticalPct: round((((statusCounts.critical || 0) + (statusCounts.offline || 0)) / total) * 100, 1),
    maintenancePct: round(((statusCounts.maintenance || 0) / total) * 100, 1),
    avgRisk: round(assets.reduce((s, a) => s + a.risk, 0) / total),
    statusCounts,
  };

  const atRisk = assets
    .filter((a) => a.risk >= 0.45 || a.status === 'critical' || a.status === 'offline' || a.incident)
    .sort((a, b) => b.priority - a.priority);

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: Date.now(),
    dataSources: ['infrastructure:serverOverview', 'infrastructure:serverTypes', 'infrastructure:datacenters'],
    systemHealth,
    assetCount: assets.length,
    atRiskCount: atRisk.length,
    assets,
    atRisk,
  };
}

// ---------------------------------------------------------------------------
// Recommendation pillar — "Guide, don't govern."
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'memory-exhaustion',
    matches: (a) => a.incident?.type === 'memory_exhaustion' || (a.metrics?.memoryUsage > 90),
    severity: 'critical',
    title: (a) => `Memory remediation for ${a.name}`,
    action: (a) => `Schedule a controlled restart of ${a.name} during the next change window and capture a heap snapshot for root-cause analysis before recycling the process.`,
    assumptions: [
      'Memory pressure is the dominant failure driver for this asset class.',
      'A controlled restart reclaims leaked memory without data loss.',
    ],
    riskReductionPct: 65,
  },
  {
    id: 'cpu-overload',
    matches: (a) => a.incident?.type === 'cpu_overload' || (a.metrics?.cpuUsage > 88),
    severity: 'high',
    title: (a) => `Rebalance load on ${a.name}`,
    action: (a) => `Shift traffic away from ${a.name} (scale out the tier or adjust load balancer weights) until sustained CPU returns below 75%.`,
    assumptions: [
      'Spare capacity exists elsewhere in the same tier to absorb shifted load.',
      'The CPU trend is load-driven rather than a runaway process.',
    ],
    riskReductionPct: 50,
  },
  {
    id: 'cache-miss-storm',
    matches: (a) => a.incident?.type === 'cache_miss_storm',
    severity: 'high',
    title: (a) => `Stabilize cache tier (${a.name})`,
    action: (a) => `Warm ${a.name} with the hot key-set and investigate the upstream service driving the miss storm before it cascades to the data tier.`,
    assumptions: ['The miss storm originates upstream, not from cache eviction policy.'],
    riskReductionPct: 45,
  },
  {
    id: 'slow-query',
    matches: (a) => a.incident?.type === 'slow_query',
    severity: 'medium',
    title: (a) => `Investigate slow queries on ${a.name}`,
    action: (a) => `Capture the active query plan on ${a.name}; consider promoting a read replica to absorb read load while the offending query is optimized.`,
    assumptions: ['A single query pattern accounts for the latency, not broad contention.'],
    riskReductionPct: 40,
  },
  {
    id: 'critical-status',
    matches: (a) => (a.status === 'critical' || a.status === 'offline') && !a.incident,
    severity: 'critical',
    title: (a) => `Triage ${a.name} (${a.status})`,
    action: (a) => `${a.name} is reporting ${a.status} without a classified incident. Open an investigation and confirm health-check signal integrity before remediation.`,
    assumptions: ['The status reflects a real condition rather than a monitoring artifact.'],
    riskReductionPct: 55,
  },
  {
    id: 'elevated-risk',
    matches: (a) => a.risk >= 0.6 && a.status === 'warning',
    severity: 'medium',
    title: (a) => `Pre-empt degradation on ${a.name}`,
    action: (a) => `${a.name} is trending toward failure. Pre-stage capacity and review recent changes; intervening now avoids a reactive incident later.`,
    assumptions: ['Current trend continues absent intervention (predictive, not reactive).'],
    riskReductionPct: 35,
  },
];

function computeDependencies(asset, allAssets) {
  const tierIdx = TIER_ORDER.indexOf(asset.tier);
  if (tierIdx < 0) return { dependents: [], blastRadius: 0 };
  const dependents = allAssets.filter(
    (other) =>
      other.id !== asset.id &&
      other.datacenter === asset.datacenter &&
      TIER_ORDER.indexOf(other.tier) >= 0 &&
      TIER_ORDER.indexOf(other.tier) < tierIdx,
  );
  return {
    dependents: dependents.slice(0, 6).map((d) => ({ id: d.id, name: d.name, tier: d.tier })),
    blastRadius: dependents.length,
  };
}

function computeConfidence(asset) {
  const corroborating = (asset.signals || []).filter((s) => s.weight >= 0.5).length;
  // Capped at 0.9 — AIDA never claims certainty ("Never Generate Blind Confidence").
  const base = Math.min(0.9, clamp01(0.45 + 0.12 * corroborating + (asset.incident ? 0.15 : 0)));
  const band = asset.incident ? 0.08 : 0.16;
  return {
    value: round(base),
    low: round(clamp01(base - band)),
    high: round(Math.min(0.95, clamp01(base + band))),
    basis: asset.incident
      ? 'Classified incident plus corroborating telemetry.'
      : 'Telemetry trend only; no classified incident — wider uncertainty band.',
    lowCoverage: !asset.incident && corroborating < 2,
  };
}

function severityRank(sev) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[sev] || 0;
}

export function buildRecommendations(observation, options = {}) {
  const { reflections = [] } = options;
  const allAssets = observation.assets || [];

  // Build dismissal index from operator reflection signals
  const SUPPRESS_WINDOW_MS = 24 * 60 * 60 * 1000; // suppress for 24h after a dismissal
  const now = Date.now();
  const dismissalById = new Map();
  for (const r of reflections) {
    if (r.kind !== 'dismissal' || !r.recommendationId) continue;
    const rts = new Date(r.ts).getTime();
    const existing = dismissalById.get(r.recommendationId);
    if (!existing) {
      dismissalById.set(r.recommendationId, { count: 1, mostRecentTs: rts });
    } else {
      existing.count++;
      if (rts > existing.mostRecentTs) existing.mostRecentTs = rts;
    }
  }

  const recs = [];

  for (const asset of observation.atRisk || []) {
    for (const rule of RULES) {
      if (!rule.matches(asset)) continue;

      const recId = stableId(asset.id, rule.id);
      const dismissal = dismissalById.get(recId);

      // Suppress this recommendation if the operator dismissed it within the window
      if (dismissal && (now - dismissal.mostRecentTs) < SUPPRESS_WINDOW_MS) break;

      const deps = computeDependencies(asset, allAssets);
      let confidence = computeConfidence(asset);

      // Reduce confidence for patterns dismissed repeatedly (visible learning signal)
      if (dismissal && dismissal.count >= 3) {
        const reduction = Math.min(0.25, 0.05 * (dismissal.count - 2));
        confidence = {
          ...confidence,
          value: round(Math.max(0.30, confidence.value - reduction)),
          low:   round(Math.max(0.20, confidence.low   - reduction)),
          high:  round(Math.max(0.40, confidence.high  - reduction)),
          basis: confidence.basis +
            ` Confidence reduced: operator dismissed this pattern ${dismissal.count} time(s).`,
        };
      }

      const impactLabel = rule.severity === 'critical' ? 'High' : rule.severity === 'high' ? 'Medium-High' : 'Medium';

      recs.push({
        id: recId,
        ruleId: rule.id,
        assetId: asset.id,
        assetName: asset.name,
        datacenter: asset.datacenterName,
        severity: rule.severity,
        title: rule.title(asset),
        rationale: rule.action(asset),
        dataSources: [
          `infrastructure:asset/${asset.id}`,
          ...(asset.signals || []).slice(0, 4).map((s) => `signal:${s.key}=${s.value}`),
        ],
        assumptions: rule.assumptions,
        estimatedImpact: {
          label: impactLabel,
          riskReductionPct: rule.riskReductionPct,
          blastRadius: deps.blastRadius,
          currentRisk: asset.risk,
        },
        confidence,
        dependencies: deps.dependents,
        suggestedCapability: 'system:action.request',
        suggestedAction: rule.action(asset),
        observedSignals: asset.signals,
        generatedAt: observation.generatedAt,
      });

      break; // one rule per asset keeps the queue actionable
    }
  }

  recs.sort((a, b) => {
    const s = severityRank(b.severity) - severityRank(a.severity);
    if (s !== 0) return s;
    const impact = b.estimatedImpact.riskReductionPct - a.estimatedImpact.riskReductionPct;
    if (impact !== 0) return impact;
    return b.confidence.value - a.confidence.value;
  });

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: observation.generatedAt,
    count: recs.length,
    recommendations: recs,
  };
}

export { ENGINE_VERSION };
