// server/routes/aida.js
//
// AIDA control-plane API — the operator-facing edge of the sentinel.
//
// Pillars served:
//   GET  /observe                        -> Observation snapshot
//   GET  /recommendations                -> ranked, explainable recommendations
//   POST /recommendations/:id/accept     -> route to human-in-the-loop INTENT
//   POST /recommendations/:id/dismiss    -> Reflection signal (operator feedback)
//   GET  /reflections                    -> recent reflection log
//
// Governance:
//   AIDA never executes. "Accept" creates a pending-review action INTENT in the
//   same queue the Capability Center surfaces. Everything writes to the shared
//   audit ledger so the Traceable Insight Chain spans AIDA and all of Kestrel.

import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import mockServerData from '../../src/data/mockserverdata.js';
import { buildObservation, buildRecommendations, ENGINE_VERSION } from '../lib/aidaEngine.js';

const router = Router();

const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const AUDIT_FILE = path.join(STATE_DIR, 'audit-log.jsonl');
const INTENTS_FILE = path.join(STATE_DIR, 'action-intents.jsonl');
const REFLECTIONS_FILE = path.join(STATE_DIR, 'aida-reflections.jsonl');

function nowIso() {
  return new Date().toISOString();
}

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function sanitizeText(value, maxLength = 1000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function appendJsonLine(filePath, payload) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(payload)}\n`, 'utf8');
}

async function readJsonLines(filePath, limit = 50) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line))
      .reverse();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAuditEvent(req, event) {
  const record = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    actor: getActor(req),
    source: 'aida',
    ...event,
  };
  await appendJsonLine(AUDIT_FILE, record);
  return record;
}

function currentObservation() {
  return buildObservation(mockServerData);
}

function findRecommendation(id) {
  const observation = currentObservation();
  const { recommendations } = buildRecommendations(observation);
  return recommendations.find((rec) => rec.id === id) || null;
}

// --- Observation -----------------------------------------------------------

router.get('/observe', async (req, res) => {
  const observation = currentObservation();
  await writeAuditEvent(req, {
    type: 'aida.observe',
    capability: 'data:metrics.read',
    outcome: 'allowed',
    detail: `Observation snapshot: ${observation.assetCount} assets, ${observation.atRiskCount} at risk.`,
  });
  res.json({ ok: true, engineVersion: ENGINE_VERSION, observation });
});

// --- Recommendation --------------------------------------------------------

router.get('/recommendations', async (req, res) => {
  const observation = currentObservation();
  const result = buildRecommendations(observation);
  await writeAuditEvent(req, {
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

// Accept -> create a pending-review INTENT. AIDA proposes; a human must approve
// in the Capability Center before anything is acted on.
router.post('/recommendations/:id/accept', async (req, res) => {
  const id = sanitizeText(req.params.id, 64);
  const note = sanitizeText(req.body?.note, 1000);
  const rec = findRecommendation(id);

  if (!rec) {
    return res.status(404).json({ ok: false, error: 'Recommendation not found or no longer current.' });
  }

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
  await writeAuditEvent(req, {
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
    message: 'Recommendation accepted. A pending action intent was created and requires human approval — AIDA will not execute it.',
  });
});

// Dismiss -> Reflection signal. Operator feedback is a first-class input.
router.post('/recommendations/:id/dismiss', async (req, res) => {
  const id = sanitizeText(req.params.id, 64);
  const reason = sanitizeText(req.body?.reason, 1000) || 'No reason provided.';
  const rec = findRecommendation(id);

  if (!rec) {
    return res.status(404).json({ ok: false, error: 'Recommendation not found or no longer current.' });
  }

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
  await writeAuditEvent(req, {
    type: 'aida.recommendation.dismissed',
    capability: 'data:recommendations.read',
    outcome: 'dismissed',
    detail: `${rec.title} — ${reason}`,
    recommendationId: rec.id,
  });

  return res.json({ ok: true, reflection });
});

// --- Reflection ------------------------------------------------------------

router.get('/reflections', async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const reflections = await readJsonLines(REFLECTIONS_FILE, limit);
  res.json({ ok: true, count: reflections.length, reflections });
});

export default router;
