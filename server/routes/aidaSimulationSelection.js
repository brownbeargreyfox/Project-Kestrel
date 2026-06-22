// server/routes/aidaSimulationSelection.js
//
// Recovers stale AIDA simulate asset ids when the data source changes under the UI
// (for example mock asset ids -> live agent ids). The middleware only rewrites a
// non-empty stale asset id for POST /api/aida/simulate and annotates the response.

import { getInfraState } from '../lib/infraState.js';

const STATUS_RANK = {
  critical: 5,
  offline: 5,
  warning: 4,
  maintenance: 2,
  online: 1,
};

function scoreFallbackAsset(asset) {
  let score = STATUS_RANK[asset?.status] ?? 0;
  if (asset?.currentIncident) score += 3;
  const metrics = asset?.metrics || {};
  score += Math.min(2, Number(metrics.memoryUsage || 0) / 50);
  score += Math.min(2, Number(metrics.cpuUsage || 0) / 50);
  score += Math.min(1, Number(metrics.networkLatency || 0) / 300);
  return score;
}

export function selectSimulationAsset(requestedAssetId, infraState = {}) {
  const assetId = typeof requestedAssetId === 'string' ? requestedAssetId.trim() : '';
  const assets = Array.isArray(infraState.serverOverview) ? infraState.serverOverview : [];

  if (!assetId || assets.length === 0) {
    return { assetId, recovered: false, requestedAssetId: assetId };
  }

  if (assets.some((asset) => asset?.id === assetId)) {
    return { assetId, recovered: false, requestedAssetId: assetId };
  }

  const [fallback] = [...assets].sort((a, b) => {
    const scoreDelta = scoreFallbackAsset(b) - scoreFallbackAsset(a);
    if (scoreDelta !== 0) return scoreDelta;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });

  return {
    assetId: fallback?.id || assetId,
    recovered: Boolean(fallback?.id),
    requestedAssetId: assetId,
  };
}

export default function recoverStaleAidaSimulationAsset(req, res, next) {
  if (req.method !== 'POST' || req.path !== '/simulate') {
    return next();
  }

  const selection = selectSimulationAsset(req.body?.assetId, getInfraState());
  if (!selection.recovered) {
    return next();
  }

  req.body = {
    ...(req.body || {}),
    assetId: selection.assetId,
  };

  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(
    payload?.ok
      ? {
          ...payload,
          assetSelection: {
            recovered: true,
            requestedAssetId: selection.requestedAssetId,
            assetId: selection.assetId,
            reason: 'Requested asset was no longer present in the current observation; selected the highest-priority current asset.',
          },
        }
      : payload,
  );

  return next();
}
