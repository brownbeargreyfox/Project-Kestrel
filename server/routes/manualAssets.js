// server/routes/manualAssets.js
//
// Local-only manual asset API for AIDA Observe/Simulate. This is for assets that
// do not yet run a Kestrel agent. It writes only to .kestrel/manual-assets.json.

import { Router } from 'express';
import { deleteManualAsset, listManualAssets, upsertManualAsset } from '../lib/manualAssets.js';
import { safeAppendMemoryNode } from '../lib/maiaMemory.js';

const router = Router();

function sanitizeId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function getActor(req) {
  return req.headers['x-kestrel-actor'] || process.env.KESTREL_DEFAULT_ACTOR || 'local-admin';
}

function routePath(req) {
  return (req.originalUrl || '').split('?')[0];
}

// ── MAIA memory mapping (pure, unit-tested in manualAssets.maia.test.js) ────────
// Manual asset add/remove are operator decisions worth remembering. These build
// the append-only MAIA node input; the route appends them non-blocking so MAIA
// failure never breaks add/delete.
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

router.post('/', (req, res) => {
  try {
    const asset = upsertManualAsset(req.body || {});
    safeAppendMemoryNode(buildManualAssetMemoryInput(asset, { actor: getActor(req), route: routePath(req) }));
    return res.status(201).json({ ok: true, asset });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message ?? 'Failed to save manual asset.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const existing = listManualAssets().find((asset) => asset.id === id);
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
