import { Router } from 'express';
import system from './system.js';
import metrics from './metrics.js';
import alerts from './alerts.js';
import simulations from './simulations.js';
import services from './services.js';
import network from './network.js';
import networkRisk from './networkRisk.js';
import ai from './ai.js';
import reference, { enrichNetworkInventoryPayload } from './reference.js';
import capabilities from './capabilities.js';
import aida from './aida.js';
import recoverStaleAidaSimulationAsset from './aidaSimulationSelection.js';
import manualAssets from './manualAssets.js';
import maia from './maia.js';
import telemetry from './telemetry.js';
import modelCatalog from './modelCatalog.js';

const router = Router();

function withOuiReference(req, res, next) {
  if (req.method !== 'GET' || req.path !== '/devices') {
    return next();
  }

  const originalJson = res.json.bind(res);
  res.json = async (payload) => {
    try {
      return originalJson(await enrichNetworkInventoryPayload(payload));
    } catch (error) {
      return originalJson({
        ...payload,
        ouiReference: {
          ok: false,
          enabled: false,
          error: error?.message ?? 'OUI reference enrichment failed.',
        },
      });
    }
  };

  return next();
}

router.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
router.use('/system', system);
router.use('/metrics', metrics);
router.use('/alerts', alerts);
router.use('/simulations', simulations);
router.use('/services', services);
router.use('/network', withOuiReference, network);
router.use('/network-risk', networkRisk);
router.use('/ai', ai);
router.use('/reference', reference);
router.use('/capabilities', capabilities);
router.use('/aida/assets/manual', manualAssets);
router.use('/aida', recoverStaleAidaSimulationAsset, aida);
router.use('/maia', maia);
router.use('/telemetry', telemetry);
router.use('/model-catalog', modelCatalog);

export default router;
