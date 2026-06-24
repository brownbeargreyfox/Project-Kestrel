import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeAppendMemoryNode } from '../lib/maiaMemory.js';

const router = Router();

// ── MAIA memory mapping (pure, unit-tested in capabilities.maia.test.js) ────────
// Approving/rejecting a pending intent is the human-in-the-loop decision point —
// exactly what MAIA should remember. Keyed by the intent's assetId so it unifies
// with the AIDA recommend/accept history for that asset.
export function buildIntentResolutionMemoryInput(intent, resolution, ctx = {}) {
  const status = resolution === 'approve' ? 'approved' : 'rejected';
  const input = {
    kind: 'operator.note',
    source: 'operator',
    assetName: intent.assetName || intent.title || intent.id,
    summary: `Intent ${status}: ${intent.title || intent.id}.`,
    detail: ctx.note || undefined,
    tags: ['intent', status, intent.severity, intent.capability].filter(Boolean),
    confidence: { value: 0.95, basis: `Operator ${status} a pending action intent.`, lowCoverage: false },
    provenance: {
      route: ctx.route,
      actor: ctx.actor,
      recommendationId: intent.recommendationId,
      auditId: ctx.auditId,
      sourceEventType: `intent.${status}`,
    },
  };
  if (intent.assetId) input.assetId = intent.assetId;
  return input;
}
const STATE_DIR = path.resolve(process.cwd(), '.kestrel');
const AUDIT_FILE = path.join(STATE_DIR, 'audit-log.jsonl');
const INTENTS_FILE = path.join(STATE_DIR, 'action-intents.jsonl');

const CAPABILITIES = [
  { id: 'network:inventory.read', title: 'Read Network Inventory', category: 'Network', risk: 'low' },
  { id: 'network:inventory.label', title: 'Label Network Devices', category: 'Network', risk: 'medium' },
  { id: 'network-risk:explain', title: 'Explain Network Risk (deterministic)', category: 'Network', risk: 'low' },
  { id: 'reference:oui.read', title: 'Read Local OUI Reference', category: 'Reference', risk: 'low' },
  { id: 'ai:provider.read', title: 'Read AI Provider Status', category: 'AI', risk: 'low' },
  { id: 'ai:chat.invoke', title: 'Invoke AI Model', category: 'AI', risk: 'medium', gated: true },
  { id: 'model:catalog.read', title: 'Read Model Catalog', category: 'AI', risk: 'low' },
  { id: 'maia:memory.read', title: 'Read MAIA Memory', category: 'Memory', risk: 'low' },
  { id: 'aida:recommendations.read', title: 'Read AIDA Recommendations', category: 'AIDA', risk: 'low' },
  { id: 'aida:simulate.run', title: 'Run AIDA Simulation (no changes applied)', category: 'AIDA', risk: 'low' },
  { id: 'system:action.request', title: 'Request System Action', category: 'System', risk: 'high', gated: true },
  { id: 'system:action.approve', title: 'Approve System Action', category: 'System', risk: 'critical', gated: true },
  { id: 'audit:events.read', title: 'Read Audit Events', category: 'Audit', risk: 'low' },
];

function nowIso() {
  return new Date().toISOString();
}

function sanitizeText(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function hasCapability(capabilityId) {
  return CAPABILITIES.some((capability) => capability.id === capabilityId);
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
    source: 'kestrel-api',
    ...event,
  };
  await appendJsonLine(AUDIT_FILE, record);
  return record;
}

router.get('/capabilities', async (req, res) => {
  const actor = getActor(req);
  const capabilities = CAPABILITIES.map((capability) => ({
    ...capability,
    granted: true,
    mode: capability.gated ? 'intent-required' : 'direct-read',
  }));

  await writeAuditEvent(req, {
    type: 'capabilities.read',
    capability: 'audit:events.read',
    outcome: 'allowed',
    detail: 'Capability catalog viewed.',
  });

  res.json({
    ok: true,
    actor,
    mode: 'dev-static-capabilities',
    denyByDefaultTarget: true,
    capabilities,
  });
});

router.get('/audit/recent', async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const events = await readJsonLines(AUDIT_FILE, limit);
  res.json({ ok: true, count: events.length, events });
});

router.post('/audit', async (req, res) => {
  const capability = sanitizeText(req.body?.capability, 96);
  const outcome = sanitizeText(req.body?.outcome, 32) || 'recorded';
  const type = sanitizeText(req.body?.type, 96) || 'manual.audit';
  const detail = sanitizeText(req.body?.detail, 1000);

  if (capability && !hasCapability(capability)) {
    return res.status(400).json({ ok: false, error: 'Unknown capability.' });
  }

  const event = await writeAuditEvent(req, {
    type,
    capability: capability || null,
    outcome,
    detail,
  });

  return res.json({ ok: true, event });
});

router.post('/intents', async (req, res) => {
  const capability = sanitizeText(req.body?.capability, 96);
  const title = sanitizeText(req.body?.title, 160) || 'Untitled action request';
  const detail = sanitizeText(req.body?.detail, 1000);

  if (!hasCapability(capability)) {
    return res.status(400).json({ ok: false, error: 'Unknown or missing capability.' });
  }

  const intent = {
    id: crypto.randomUUID(),
    ts: nowIso(),
    actor: getActor(req),
    capability,
    title,
    detail,
    status: 'pending-review',
    requiresApproval: true,
  };

  await appendJsonLine(INTENTS_FILE, intent);
  await writeAuditEvent(req, {
    type: 'intent.created',
    capability,
    outcome: 'pending-review',
    detail: title,
    intentId: intent.id,
  });

  return res.status(202).json({ ok: true, intent });
});

router.get('/intents/recent', async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  const intents = await readJsonLines(INTENTS_FILE, limit);
  res.json({ ok: true, count: intents.length, intents });
});

// ---------------------------------------------------------------------------
// Intent resolution — the human-in-the-loop decision point.
// Approve or reject a pending intent. Both outcomes are fully audited.
// The AIDA Constitution: "Humans make all final decisions."
// ---------------------------------------------------------------------------

async function readAllIntents() {
  try {
    const raw = await fs.readFile(INTENTS_FILE, 'utf8');
    return raw.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch (err) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

async function rewriteIntents(intents) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(INTENTS_FILE, intents.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
}

async function resolveIntent(req, res, resolution) {
  const intentId = sanitizeText(req.params.id, 64);
  const note = sanitizeText(req.body?.note, 500);

  const all = await readAllIntents();
  const idx = all.findIndex((i) => i.id === intentId);

  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'Intent not found.' });
  }

  const intent = all[idx];

  if (intent.status !== 'pending-review') {
    return res.status(409).json({
      ok: false,
      error: `Intent is already "${intent.status}" and cannot be ${resolution}d.`,
    });
  }

  all[idx] = {
    ...intent,
    status: resolution === 'approve' ? 'approved' : 'rejected',
    resolvedAt: nowIso(),
    resolvedBy: getActor(req),
    resolutionNote: note || null,
  };

  await rewriteIntents(all);

  const audit = await writeAuditEvent(req, {
    type: `intent.${resolution}d`,
    capability: 'system:action.approve',
    outcome: resolution === 'approve' ? 'approved' : 'rejected',
    detail: `${intent.title}${note ? ` — ${note}` : ''}`,
    intentId: intent.id,
    origin: intent.origin || 'manual',
    assetId: intent.assetId || null,
  });

  // MAIA append-only record of the human-in-the-loop decision (non-blocking).
  safeAppendMemoryNode(
    buildIntentResolutionMemoryInput(intent, resolution, {
      actor: getActor(req),
      route: (req.originalUrl || '').split('?')[0],
      auditId: audit.id,
      note,
    }),
  );

  return res.json({ ok: true, intent: all[idx] });
}

router.post('/intents/:id/approve', (req, res) => resolveIntent(req, res, 'approve'));
router.post('/intents/:id/reject',  (req, res) => resolveIntent(req, res, 'reject'));

export default router;
