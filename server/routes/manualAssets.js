// server/routes/manualAssets.js
//
// Local-only manual asset API for AIDA Observe/Simulate. This is for assets that
// do not yet run a Kestrel agent. It writes only to .kestrel/manual-assets.json.

import { Router } from 'express';
import { deleteManualAsset, listManualAssets, upsertManualAsset } from '../lib/manualAssets.js';
import { safeAppendMemoryNode } from '../lib/maiaMemory.js';

const router = Router();

const UPDATE_FIELDS = ['ip', 'name', 'os', 'type', 'datacenter', 'tier', 'criticality', 'status'];
const METRIC_FIELDS = ['cpuUsage', 'memoryUsage', 'diskUsage', 'networkLatency', 'storageIO', 'connections'];

function sanitizeId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

export function isWorkflowActionsEnabled(env = process.env) {
  if (env.KESTREL_WORKFLOW_ACTIONS === 'true') return true;
  if (env.KESTREL_WORKFLOW_ACTIONS === 'false') return false;
  return env.VITE_FF_WORKFLOW_ACTIONS === 'true';
}

function requireWorkflowActions(req, res, next) {
  if (isWorkflowActionsEnabled()) return next();
  return res.status(403).json({
    ok: false,
    error: 'Manual asset actions are disabled. Set KESTREL_WORKFLOW_ACTIONS=true to enable add, update, and delete.',
  });
}

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function routePath(req) {
  return (req.originalUrl || '').split('?')[0];
}

function findManualAsset(id) {
  return listManualAssets().find((asset) => asset.id === id) || null;
}

export function mergeManualAssetUpdate(existing, patch = {}) {
  return {
    ...existing,
    ...patch,
    id: existing.id,
    metrics: {
      ...(existing.metrics || {}),
      ...(patch.metrics || {}),
    },
  };
}

function changedFields(before = {}, after = {}) {
  const changed = [];
  for (const key of UPDATE_FIELDS) {
    if ((before[key] || '') !== (after[key] || '')) changed.push(key);
  }
  for (const key of METRIC_FIELDS) {
    if (Number(before.metrics?.[key] ?? 0) !== Number(after.metrics?.[key] ?? 0)) changed.push(`metrics.${key}`);
  }
  if (stableJson(before.currentIncident) !== stableJson(after.currentIncident)) changed.push('currentIncident');
  return changed;
}

// ── MAIA memory mapping (pure, unit-tested in manualAssets.maia.test.js) ────────
// Manual asset add/update/remove are operator decisions worth remembering. These
// build append-only MAIA node input; routes append them failure-tolerantly so
// MAIA never breaks add/update/delete.
export function buildManualAssetMemoryInput(asset, ctx = {}) {
  return {
    kind: 'operator.note',
    source: 'operator',
    assetId: asset.id,
    assetName: asset.name,
    summary: `Manual asset added: ${asset.name} (${asset.type}) in ${asset.datacenter}/${asset.tier}.`,
    detail: asset.ip ? `ip ${asset.ip}` : undefined,
    tags: ['manual-asset', 'asset-added', asset.type, asset.tier, asset.criticality, asset.status],
    confidence: { value: 0.9, basis: 'Operator added a manual asset.', lowCoverage: false },
    provenance: { route: ctx.route, actor: ctx.actor, sourceEventType: 'aida.manual-asset.added' },
  };
}

export function buildManualAssetUpdateMemoryInput(before, after, ctx = {}) {
  const fields = changedFields(before, after);
  const incidentType = after.currentIncident?.type;
  return {
    kind: 'operator.note',
    source: 'operator',
    assetId: after.id,
    assetName: after.name,
    summary: incidentType
      ? `Manual asset updated: ${after.name} (${incidentType}).`
      : `Manual asset updated: ${after.name}.`,
    detail: fields.length ? `changed ${fields.join(', ')}` : 'no material field changes detected',
    tags: ['manual-asset', 'asset-updated', after.type, after.tier, after.criticality, after.status, ...(incidentType ? [incidentType] : [])],
    confidence: { value: 0.9, basis: 'Operator updated a manual asset.', lowCoverage: false },
    provenance: { route: ctx.route, actor: ctx.actor, sourceEventType: 'aida.manual-asset.updated' },
  };
}

export function buildManualAssetDeleteMemoryInput(asset, ctx = {}) {
  const id = typeof asset === 'string' ? asset : asset?.id;
  const name = typeof asset === 'string' ? asset : asset?.name || asset?.id;
  return {
    kind: 'operator.note',
    source: 'operator',
    assetId: id,
    assetName: name,
    summary: `Manual asset removed: ${name}.`,
    detail: typeof asset === 'object' && asset?.ip ? `ip ${asset.ip}` : undefined,
    tags: ['manual-asset', 'asset-removed', ...(typeof asset === 'object' ? [asset.type, asset.tier, asset.criticality, asset.status] : [])],
    confidence: { value: 0.9, basis: 'Operator removed a manual asset.', lowCoverage: false },
    provenance: { route: ctx.route, actor: ctx.actor, sourceEventType: 'aida.manual-asset.removed' },
  };
}

router.get('/', (req, res) => {
  try {
    const assets = listManualAssets();
    return res.json({ ok: true, count: assets.length, assets });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message ?? 'Failed to list manual assets.' });
  }
});

router.post('/', requireWorkflowActions, (req, res) => {
  try {
    const asset = upsertManualAsset(req.body || {});
    safeAppendMemoryNode(buildManualAssetMemoryInput(asset, { actor: getActor(req), route: routePath(req) }));
    return res.status(201).json({ ok: true, asset });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message ?? 'Failed to save manual asset.' });
  }
});

router.put('/:id', requireWorkflowActions, (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const existing = findManualAsset(id);
    if (!existing) return res.status(404).json({ ok: false, error: `Manual asset ${id} not found.` });
    const asset = upsertManualAsset(mergeManualAssetUpdate(existing, req.body || {}));
    safeAppendMemoryNode(buildManualAssetUpdateMemoryInput(existing, asset, { actor: getActor(req), route: routePath(req) }));
    return res.json({ ok: true, asset });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message ?? 'Failed to update manual asset.' });
  }
});

router.delete('/:id', requireWorkflowActions, (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const existing = findManualAsset(id);
    const deleted = deleteManualAsset(id);
    if (deleted) {
      safeAppendMemoryNode(buildManualAssetDeleteMemoryInput(existing || id, { actor: getActor(req), route: routePath(req) }));
    }
    return res.json({ ok: true, id, deleted });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message ?? 'Failed to delete manual asset.' });
  }
});

export default router;
