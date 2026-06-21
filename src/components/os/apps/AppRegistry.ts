// src/components/os/apps/AppRegistry.ts
// Unified app registry compatible with useUIStore.launchApp (component | loader | import)

import { Terminal, Shield, Activity, Folder, BellRing, Globe, Bell, Plug, Bot, ShieldCheck, ShieldAlert } from 'lucide-react';
import type { AppManifest } from '../../../Types/os.types';
import type { ComponentType } from 'react';

// Extend your manifest with fields our launcher understands
export type KestrelApp = AppManifest & {
  // One of these must be present for the launcher:
  component?: ComponentType<any>;
  loader?: () => Promise<any>;
  import?: () => Promise<any>;
  // Optional window sizing hints
  w?: number;
  h?: number;
  // Optional override to allow duplicate windows for the same app.
  multiInstance?: boolean;
};

// NOTE: keep 'mount' for any legacy code that still uses it, but the launcher will
// use 'component' / 'loader' / 'import'. We include both where useful.

export const AppRegistry: Record<string, KestrelApp> = {
  // === KESTREL CORE APPS ===
  'kestrel-core': {
    id: 'kestrel-core',
    title: 'Kestrel Core (bg)',
    icon: Activity,
    permissions: ['events:publish', 'events:subscribe'],
    // Background app: no visible UI yet
    component: () => null,
    mount: async () => ({ default: () => null }),
    w: 860, h: 520,
  },

  'kestrel-terminal': {
    id: 'kestrel-terminal',
    title: 'Terminal',
    icon: Terminal,
    permissions: ['ui:window', 'events:publish', 'events:subscribe'],
    // TODO: point to real terminal when ready
    // component: () => null,
    import: () => import('./TerminalApp.jsx').catch(() => ({ default: () => null })),
    mount: async () => ({ default: () => null }),
    w: 900, h: 540,
  },

  'kestrel-files': {
    id: 'kestrel-files',
    title: 'Files',
    icon: Folder,
    permissions: ['ui:window'],
    import: () => import('./FilesApp.jsx').catch(() => ({ default: () => null })),
    mount: async () => ({ default: () => null }),
    w: 980, h: 640,
  },

  'kestrel-breach-monitor': {
    id: 'kestrel-breach-monitor',
    title: 'Breach Monitor',
    icon: BellRing,
    permissions: ['ui:window', 'events:subscribe'],
    import: () => import('./BreachMonitorApp.jsx'),
    mount: () => import('./BreachMonitorApp.jsx'),
    w: 920, h: 600,
  },

  // === MIGRATED WIDGET APPS ===
  'performance-metrics': {
    id: 'performance-metrics',
    title: 'Performance Metrics',
    icon: Activity,
    permissions: [
      'ui:window',
      'events:subscribe',
      'data:metrics.read',
      'events:publish',
      'aida:agent.access',
      'maia:memory.read',
      'maia:memory.write',
    ],
    import: () => import('./PerformanceMetricsApp.jsx'),
    mount: () => import('./PerformanceMetricsApp.jsx'),
    w: 1100, h: 700,
  },

  'alert-center': {
    id: 'alert-center',
    title: 'Alert Center',
    icon: Bell,
    permissions: [
      'ui:window',
      'events:subscribe',
      'data:alerts.read',
      'events:publish',
      'aida:agent.access',
    ],
    import: () => import('./AlertCenterApp.jsx'),
    mount: () => import('./AlertCenterApp.jsx'),
    w: 560, h: 640,
  },

  'network-topology': {
    id: 'network-topology',
    title: 'Network Inventory',
    icon: Globe,
    permissions: ['ui:window', 'events:subscribe', 'data:topology.read', 'data:metrics.read'],
    import: () => import('./NetworkTopologyApp.jsx'),
    mount: () => import('./NetworkTopologyApp.jsx'),
    w: 1180, h: 760,
  },

  'ai-providers': {
    id: 'ai-providers',
    title: 'AI Providers',
    icon: Bot,
    permissions: ['ui:window', 'events:subscribe', 'aida:agent.access'],
    import: () => import('./AIProvidersApp.jsx'),
    mount: () => import('./AIProvidersApp.jsx'),
    w: 980, h: 680,
  },

  'aida-sentinel': {
    id: 'aida-sentinel',
    title: 'AIDA Sentinel',
    icon: ShieldAlert,
    permissions: [
      'ui:window',
      'events:subscribe',
      'events:publish',
      'data:metrics.read',
      'data:recommendations.read',
      'aida:agent.access',
      'maia:memory.read',
      'maia:memory.write',
    ],
    import: () => import('../../../plugins/aida/views/AIDACommandCenter'),
    mount:  () => import('../../../plugins/aida/views/AIDACommandCenter'),
    w: 1180, h: 800,
  },

  'capability-center': {
    id: 'capability-center',
    title: 'Capability Center',
    icon: ShieldCheck,
    permissions: ['ui:window', 'events:subscribe', 'audit:events.read'],
    import: () => import('./CapabilityCenterApp.jsx'),
    mount: () => import('./CapabilityCenterApp.jsx'),
    w: 1120, h: 760,
  },

  // === LEGACY COMPATIBILITY ===
  'security-events': {
    id: 'security-events',
    title: 'Security Events',
    icon: Shield,
    permissions: ['ui:window', 'events:subscribe', 'data:alerts.read'],
    // maps to alert-center implementation
    import: () => import('./AlertCenterApp.jsx'),
    mount: () => import('./AlertCenterApp.jsx'),
    w: 1000, h: 680,
  },

  'system-health': {
    id: 'system-health',
    title: 'System Health',
    icon: Activity,
    permissions: ['ui:window', 'events:subscribe', 'data:metrics.read'],
    import: () => import('./SystemHealthApp.jsx'),
    mount: () => import('./SystemHealthApp.jsx'),
    w: 1100, h: 700,
  },

  'plugin-diagnostics': {
    id: 'plugin-diagnostics',
    title: 'Plugin Diagnostics',
    icon: Plug,
    permissions: ['ui:window'],
    import: () => import('../admin/PluginPanel'),
    mount: () => import('../admin/PluginPanel'),
    w: 900, h: 560,
  },
};