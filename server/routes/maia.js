// server/routes/maia.js
//
// MAIA v0 read-only API — deterministic memory retrieval and provenance-rich
// insights. There is intentionally NO write endpoint: MAIA ingests from AIDA
// events server-side (see routes/aida.js), never from arbitrary UI writes.
//
// MAIA informs, never acts: no simulations, broker/provider calls, remediation,
// or workflow actions originate here.

import { Router } from 'express';
import {
  readMemoryNodes,
  buildMemoryInsights,
  buildCoverageSummary,
} from '../lib/maiaMemory.js';

const router = Router();

function parseQuery(req) {
  const query = {};
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId.trim().slice(0, 120) : '';
  const text = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const kind = typeof req.query.kind === 'string' ? req.query.kind.trim().slice(0, 64) : '';
  const limit = Number(req.query.limit);
  if (assetId) query.assetId = assetId;
  if (text) query.q = text;
  if (kind) query.kind = kind;
  if (Number.isFinite(limit) && limit > 0) query.limit = limit;
  return query;
}

router.get('/memory', (req, res) => {
  try {
    const nodes = readMemoryNodes(parseQuery(req));
    res.json({ ok: true, count: nodes.length, nodes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? 'Failed to read MAIA memory.' });
  }
});

router.get('/insights', (req, res) => {
  try {
    const insights = buildMemoryInsights(parseQuery(req));
    res.json({ ok: true, count: insights.length, insights });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? 'Failed to build MAIA insights.' });
  }
});

router.get('/coverage', (req, res) => {
  try {
    const query = parseQuery(req);
    // Coverage reflects the structural footprint (asset/kind), not text relevance.
    const nodes = readMemoryNodes({ assetId: query.assetId, kind: query.kind, limit: 500 });
    const coverage = buildCoverageSummary(nodes, query);
    res.json({ ok: true, coverage });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? 'Failed to build MAIA coverage.' });
  }
});

export default router;
