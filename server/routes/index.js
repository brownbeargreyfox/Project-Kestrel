import { Router } from 'express';
import system from './system.js';
import metrics from './metrics.js';
import alerts from './alerts.js';
import simulations from './simulations.js';
import services from './services.js';
import network from './network.js';

const router = Router();

router.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
router.use('/system', system);
router.use('/metrics', metrics);
router.use('/alerts', alerts);
router.use('/simulations', simulations);
router.use('/services', services);
router.use('/network', network);

export default router;
