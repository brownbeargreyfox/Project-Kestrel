// server/routes/manualAssets.js
//
// Local-only manual asset API for AIDA Observe/Simulate. This is for assets that
// do not yet run a Kestrel agent. It writes only to .kestrel/manual-assets.json.

import { Router } from 'express';
import { deleteManualAsset, listManualAssets, upsertManualAsset } from '../lib/manualAssets.js';

const router = Router();

function sanitizeId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
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
    return res.status(201).json({ ok: true, asset });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message ?? 'Failed to save manual asset.' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = sanitizeId(req.params.id);
    const deleted = deleteManualAsset(id);
    return res.json({ ok: true, id, deleted });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message ?? 'Failed to delete manual asset.' });
  }
});

export default router;
