// server/routes/aida.js
//
// AIDA control-plane API — the operator-facing edge of the sentinel.
//
// Endpoints:
//   GET  /observe                        -> live observation snapshot
//   GET  /recommendations                -> ranked, explainable recommendations
//   GET  /recommendations/:id/narrate    -> AI-generated narrative (via broker)
//   POST /recommendations/:id/accept     -> route to human-in-the-loop INTENT
//   POST /recommendations/:id/dismiss    -> reflection signal (operator feedback)
//   GET  /reflections                    -> recent reflection log
//   POST /simulate                       -> what-if scenario projection
//
// Governance: AIDA never executes. Accept creates a pending-review intent.
// Everything writes to the shared audit ledger.

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { getInfraState } from '../lib/infraState.js';
import { buildObservation, buildRecommendations, ENGINE_VERSION } from '../lib/aidaEngine.js';
import { broadcast } from '../lib/eventBus.js';

const router = Router();

const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const AUDIT_FILE = path.join(STATE_DIR, 'audit-log.jsonl');
const INTENTS_FILE = path.join(STATE_DIR, 'action-intents.jsonl');
const REFLECTIONS_FILE = path.join(STATE_DIR, 'aida-reflections.jsonl');

const TIER_ORDER = ['dmz', 'web-tier', 'app-tier', 'data-tier', 'management', 'cloud-hybrid'];

function nowIso() { return new Date().toISOString(); }

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function sanitize(value, max = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

async function appendJsonLine(filePath, payload) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function readJsonLines(filePath, limit = 50) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean).slice(-limit).map((l) => JSON.parse(l)).reverse();
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAudit(req, event) {
  const record = { id: crypto.randomUUID(), ts: nowIso(), actor: getActor(req), source: 'aida', ...event };
  await appendJsonLine(AUDIT_FILE, record);
  return record;
}

function currentObservation() {
  return buildObservation(getInfraState());
}

async function findRecommendation(id) {
  const obs = currentObservation();
  const reflections = await readJsonLines(REFLECTIONS_FILE, 500);
  return buildRecommendations(obs, { reflections }).recommendations.find((r) => r.id === id) || null;
}

// ---------------------------------------------------------------------------
// AI Broker — call internally so the broker's audit trail is unified.
// Gracefully returns null when the broker is disabled or Ollama unreachable.
// ---------------------------------------------------------------------------
async function callBroker(system, prompt) {
  const port = process.env.PORT || 3001;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ai/broker/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'local-ollama',
        system: system.slice(0, 2000),
        prompt: prompt.slice(0, 8000),
        temperature: 0.3,
        timeoutMs: 30_000,
      }),
      signal: AbortSignal.timeout(35_000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Observe
// ---------------------------------------------------------------------------
router.get('/observe', async (req, res) => {
  const observation = currentObservation();
  await writeAudit(req, {
    type: 'aida.observe',
    capability: 'data:metrics.read',
    outcome: 'allowed',
    detail: `Observation: ${observation.assetCount} assets, ${observation.atRiskCount} at risk.`,
  });
  res.json({ ok: true, engineVersion: ENGINE_VERSION, observation });
});

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
router.get('/recommendations', async (req, res) => {
  const observation = currentObservation();
  const reflections = await readJsonLines(REFLECTIONS_FILE, 500);
  const result = buildRecommendations(observation, { reflections });
  await writeAudit(req, {
    type: 'aida.recommend',
    capability: 'data:recommendations.read',
    outcome: 'allowed',
    detail: `Generated ${result.count} recommendation(s).`,
  });
  res.json({
    ok: true,
    engineVersion: ENGINE_VERSION,
    generatedAt: result.generatedAt,
    systemHealth: observation.systemHealth,
    count: result.count,
    recommendations: result.recommendations,
  });
});

// ---------------------------------------------------------------------------
// Narrate — AI-generated operator-readable explanation via the AI broker.
// Returns the narrative text or a graceful null if the broker is unavailable.
// ---------------------------------------------------------------------------
router.get('/recommendations/:id/narrate', async (req, res) => {
  const id = sanitize(req.params.id, 64);
  const rec = await findRecommendation(id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Recommendation not found.' });

  const system = `You are AIDA, an infrastructure sentinel. Your role is to help operators understand exactly why an infrastructure issue is serious and what they should do about it. Be direct, precise, and cite the specific metrics. Maximum 3 short paragraphs.`;

  const prompt = `Generate an operator-facing narrative for this infrastructure recommendation.

Asset: ${rec.assetName} (type: ${rec.assetName.split('-')[0]}, datacenter: ${rec.datacenter})
Severity: ${rec.severity}
Current risk score: ${Math.round(rec.estimatedImpact.currentRisk * 100)}%
Signals: ${(rec.observedSignals || []).map((s) => s.label).join(', ')}
${rec.estimatedImpact.blastRadius > 0 ? `Blast radius: ${rec.estimatedImpact.blastRadius} dependent assets` : ''}
${rec.confidence.lowCoverage ? 'Note: limited historical data — higher uncertainty.' : ''}

Recommended action: ${rec.rationale}

Write a concise narrative (3 paragraphs max) explaining: (1) what is happening and why it matters, (2) what the operator should do and why now, (3) what to watch for after the action.`;

  const brokerResult = await callBroker(system, prompt);

  await writeAudit(req, {
    type: 'aida.narrate',
    capability: 'ai:chat.invoke',
    outcome: brokerResult?.ok ? 'allowed' : 'broker-unavailable',
    detail: `Narration for recommendation ${id.slice(0, 8)}.`,
    recommendationId: id,
  });

  if (!brokerResult?.ok) {
    return res.json({
      ok: true,
      narrative: null,
      brokerStatus: 'unavailable',
      message: 'AI broker is not available. Enable it by setting KESTREL_AI_BROKER_ENABLED=true and KESTREL_OLLAMA_ENABLED=true.',
    });
  }

  res.json({
    ok: true,
    narrative: brokerResult.text,
    model: brokerResult.model,
    auditId: brokerResult.auditId,
  });
});

// ---------------------------------------------------------------------------
// Accept → pending-review INTENT (human approval required; AIDA never acts)
// ---------------------------------------------------------------------------
router.post('/recommendations/:id/accept', async (req, res) => {
  const id = sanitize(req.params.id, 64);
  const note = sanitize(req.body?.note, 1000);
  const rec = await findRecommendation(id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Recommendation not found or no longer current.' });

  const intent = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    actor: getActor(req),
    capability: rec.suggestedCapability,
    title: rec.title,
    detail: rec.suggestedAction,
    status: 'pending-review',
    requiresApproval: true,
    origin: 'aida',
    recommendationId: rec.id,
    assetId: rec.assetId,
    severity: rec.severity,
    confidence: rec.confidence,
    operatorNote: note || null,
  };

  await appendJsonLine(INTENTS_FILE, intent);
  broadcast('intent.created', {
    intentId: intent.id,
    title:    intent.title,
    severity: intent.severity,
    origin:   'aida',
  });
  await writeAudit(req, {
    type: 'aida.recommendation.accepted',
    capability: rec.suggestedCapability,
    outcome: 'pending-review',
    detail: rec.title,
    recommendationId: rec.id,
    intentId: intent.id,
  });

  return res.status(202).json({
    ok: true,
    intent,
    message: 'Recommendation accepted. A pending intent was created and requires human approval — AIDA will not execute it.',
  });
});

// ---------------------------------------------------------------------------
// Dismiss → reflection signal
// ---------------------------------------------------------------------------
router.post('/recommendations/:id/dismiss', async (req, res) => {
  const id = sanitize(req.params.id, 64);
  const reason = sanitize(req.body?.reason, 1000) || 'No reason provided.';
  const rec = await findRecommendation(id);
  if (!rec) return res.status(404).json({ ok: false, error: 'Recommendation not found or no longer current.' });

  const reflection = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    actor: getActor(req),
    kind: 'dismissal',
    recommendationId: rec.id,
    assetId: rec.assetId,
    assetName: rec.assetName,
    title: rec.title,
    severity: rec.severity,
    reason,
  };

  await appendJsonLine(REFLECTIONS_FILE, reflection);
  await writeAudit(req, {
    type: 'aida.recommendation.dismissed',
    capability: 'data:recommendations.read',
    outcome: 'dismissed',
    detail: `${rec.title} — ${reason}`,
    recommendationId: rec.id,
  });

  return res.json({ ok: true, reflection });
});

// ---------------------------------------------------------------------------
// Reflections
// ---------------------------------------------------------------------------
router.get('/reflections', async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const reflections = await readJsonLines(REFLECTIONS_FILE, limit);
  res.json({ ok: true, count: reflections.length, reflections });
});

// ---------------------------------------------------------------------------
// Simulate — "Model before meddle."
//
// Projects what happens if a scenario is applied to an asset, WITHOUT touching
// live state. Returns a before/after comparison with risk deltas and cascade
// impact across dependent tiers.
//
// Body: { assetId, scenario: 'restart' | 'scale-out' | 'drain' | 'patch' }
// ---------------------------------------------------------------------------

const SCENARIOS = {
  restart: {
    label: 'Controlled restart',
    description: 'Clear the process, reclaim leaked memory, accept brief downtime.',
    apply: (asset) => ({
      ...asset,
      status: 'online',
      currentIncident: null,
      metrics: { ...asset.metrics, memoryUsage: 18, cpuUsage: 12, networkLatency: Math.max(1, asset.metrics.networkLatency * 0.6) },
    }),
  },
  'scale-out': {
    label: 'Scale out tier',
    description: 'Add capacity to share load — reduces pressure on this node.',
    apply: (asset) => ({
      ...asset,
      metrics: {
        ...asset.metrics,
        cpuUsage: Math.max(5, asset.metrics.cpuUsage * 0.65),
        memoryUsage: Math.max(5, asset.metrics.memoryUsage * 0.80),
        networkLatency: Math.max(1, asset.metrics.networkLatency * 0.75),
      },
    }),
  },
  drain: {
    label: 'Drain & maintenance',
    description: 'Gracefully remove from rotation, reducing downstream pressure.',
    apply: (asset) => ({
      ...asset,
      status: 'maintenance',
      currentIncident: null,
      metrics: { ...asset.metrics, cpuUsage: 2, connections: 0 },
    }),
  },
  patch: {
    label: 'Patch & recycle',
    description: 'Apply pending patches then restart — resolves software-level incidents.',
    apply: (asset) => ({
      ...asset,
      status: 'online',
      currentIncident: null,
      metrics: { ...asset.metrics, memoryUsage: 22, cpuUsage: 15, networkLatency: Math.max(1, asset.metrics.networkLatency * 0.7) },
    }),
  },
};

router.post('/simulate', async (req, res) => {
  const assetId = sanitize(req.body?.assetId, 64);
  const scenarioKey = sanitize(req.body?.scenario, 32);

  if (!SCENARIOS[scenarioKey]) {
    return res.status(400).json({
      ok: false,
      error: `Unknown scenario "${scenarioKey}". Valid options: ${Object.keys(SCENARIOS).join(', ')}.`,
    });
  }

  const scenario = SCENARIOS[scenarioKey];
  const baseState = getInfraState();
  const asset = baseState.serverOverview?.find((s) => s.id === assetId);

  if (!asset) {
    return res.status(404).json({ ok: false, error: `Asset "${assetId}" not found in current observation.` });
  }

  // --- Before ---
  const before = buildObservation(baseState);
  const beforeAsset = before.assets.find((a) => a.id === assetId);
  const beforeRecs = buildRecommendations(before);
  const beforeAssetRec = beforeRecs.recommendations.find((r) => r.assetId === assetId);

  // --- After (cloned, mutated, not persisted) ---
  const mutated = JSON.parse(JSON.stringify(baseState));
  mutated.serverOverview = mutated.serverOverview.map((s) =>
    s.id === assetId ? scenario.apply(s) : s,
  );
  const after = buildObservation(mutated);
  const afterAsset = after.assets.find((a) => a.id === assetId);

  // Cascade: dependents in the same datacenter that sit above this tier
  const tierIdx = TIER_ORDER.indexOf(asset.tier || '');
  const dependentsBefore = tierIdx < 0 ? [] : before.assets.filter(
    (a) => a.id !== assetId && a.datacenter === asset.datacenter &&
      TIER_ORDER.indexOf(a.tier || '') >= 0 && TIER_ORDER.indexOf(a.tier || '') < tierIdx,
  );
  const dependentsAfter = tierIdx < 0 ? [] : after.assets.filter(
    (a) => a.id !== assetId && a.datacenter === asset.datacenter &&
      TIER_ORDER.indexOf(a.tier || '') >= 0 && TIER_ORDER.indexOf(a.tier || '') < tierIdx,
  );

  const riskDelta = (afterAsset?.risk ?? 0) - (beforeAsset?.risk ?? 0);
  const healthDelta = after.systemHealth.healthyPct - before.systemHealth.healthyPct;
  const cascadeRiskBefore = dependentsBefore.reduce((s, a) => s + a.risk, 0) / Math.max(1, dependentsBefore.length);
  const cascadeRiskAfter  = dependentsAfter.reduce((s, a) => s + a.risk, 0) / Math.max(1, dependentsAfter.length);

  await writeAudit(req, {
    type: 'aida.simulate',
    capability: 'data:metrics.read',
    outcome: 'allowed',
    detail: `Simulation: ${scenario.label} on ${asset.name}. Risk delta: ${(riskDelta * 100).toFixed(1)}%.`,
    assetId,
    scenario: scenarioKey,
  });

  res.json({
    ok: true,
    scenario: { key: scenarioKey, label: scenario.label, description: scenario.description },
    asset: { id: asset.id, name: asset.name, type: asset.type, datacenter: asset.datacenter },
    before: {
      assetRisk: beforeAsset?.risk ?? 0,
      assetStatus: beforeAsset?.status ?? asset.status,
      systemHealthyPct: before.systemHealth.healthyPct,
      activeRecommendation: beforeAssetRec ? { title: beforeAssetRec.title, severity: beforeAssetRec.severity } : null,
      cascadeAvgRisk: Math.round(cascadeRiskBefore * 100) / 100,
      dependentCount: dependentsBefore.length,
    },
    after: {
      assetRisk: afterAsset?.risk ?? 0,
      assetStatus: afterAsset?.status ?? 'unknown',
      systemHealthyPct: after.systemHealth.healthyPct,
      cascadeAvgRisk: Math.round(cascadeRiskAfter * 100) / 100,
    },
    delta: {
      riskReduction: Math.round(-riskDelta * 100),
      healthImprovement: Math.round(healthDelta * 10) / 10,
      cascadeRiskReduction: Math.round((cascadeRiskBefore - cascadeRiskAfter) * 100),
    },
    disclaimer: 'This is a deterministic projection based on the current observation. Actual outcomes depend on live conditions at execution time.',
  });
});

export default router;
