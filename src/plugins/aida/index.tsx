// src/plugins/aida/index.tsx
//
// AIDA plugin registration.
// Loaded by PluginLoader as a bundled plugin (id: "aida").
// AppRegistry (aida-sentinel entry) is the primary UI path — this file wires
// the plugin system's tab/widget slots as a secondary surface.

import * as React from 'react';
import type { HostContext } from '../../Types/plugin';
import mockServerData from '../../data/mockserverdata';
import { createDynamicEnterpriseSystem } from '../../data/dynamicServerEvolution';

// ── lazy views ────────────────────────────────────────────────────────────────

const AidaInfrastructure  = React.lazy(() => import('./views/InfrastructureTab'));
const AidaPlanner         = React.lazy(() => import('./views/SimulationPlannerWidget'));
const AidaCommandCenter   = React.lazy(() => import('./views/AIDACommandCenter'));
const AidaHealthRadar     = React.lazy(() => import('./views/PredictiveHealthRadar'));

// ── plugin manifest (loose shape — loader uses duck-typing) ───────────────────

const manifest = {
  id:      'aida',
  name:    'AIDA Infrastructure Intelligence',
  version: '1.0.0',
  permissions: [
    'events:publish',
    'events:subscribe',
    'data:metrics.read',
    'ui:window',
  ],
  tabs: [
    {
      id:        'infrastructure-tab',
      label:     'Infrastructure',
      order:     10,
      component: AidaInfrastructure,
    },
    {
      id:        'command-center',
      label:     'Command Center',
      order:     20,
      component: AidaCommandCenter,
    },
  ],
  widgets: [
    {
      id:        'simulation-planner',
      title:     'Simulation Planner',
      component: AidaPlanner,
      sizeHints: { defaultWidth: 520, defaultHeight: 360 },
      category:  'infrastructure',
    },
    {
      id:        'health-radar',
      title:     'Predictive Health Radar',
      component: AidaHealthRadar,
      sizeHints: { defaultWidth: 420, defaultHeight: 460 },
      category:  'infrastructure',
    },
  ],
};

// ── register function (called by PluginLoader as module.default()) ─────────────

export default function register(host?: HostContext) {
  let system: ReturnType<typeof createDynamicEnterpriseSystem> | null = null;
  let started    = false;
  let teardowns: Array<() => void> = [];

  function setup() {
    if (host !== undefined) {
      // Register event schema if the real EventBus supports it (optional extension)
      const bus = host.eventBus as { registerSchema?: (s: unknown) => void };
      bus.registerSchema?.({
        name:    'simulation.complete',
        version: '1.0',
        schema: {
          type:       'object',
          properties: {
            runId:      { type: 'string' },
            result:     { type: 'string' },
            startedAt:  { type: 'number' },
            finishedAt: { type: 'number' },
          },
          required: ['runId', 'result'],
        },
      });

      const unsub = host.eventBus.subscribe('threshold.breach', (_payload) => {
        // route to command center / radar widgets when wired
      });
      teardowns.push(unsub);
    }

    if (!system) {
      system = createDynamicEnterpriseSystem(mockServerData);
    }
    if (!started && system) {
      system.startEvolution(3000);
      started = true;
    }
  }

  function dispose() {
    if (system) system.stopEvolution();
    for (const fn of teardowns) {
      try { fn(); } catch { /* ignore */ }
    }
    teardowns = [];
    started   = false;
  }

  return { manifest, setup, dispose };
}
