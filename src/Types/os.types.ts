// src/Types/os.types.ts
// Shared OS shell app/manifest types used by the launcher and registry.

import type { ComponentType, FC } from 'react';

export type KestrelPermission =
  | 'ui:window'
  | 'events:publish'
  | 'events:subscribe'
  | 'data:metrics.read'
  | 'data:recommendations.read'
  | 'data:alerts.read'
  | 'data:topology.read'
  | 'data:incidents.read'
  | 'aida:agent.access'
  | 'maia:memory.read'
  | 'maia:memory.write'
  | string;

export interface AppManifest {
  id: string;
  title: string;
  icon?: ComponentType<any>;
  permissions: KestrelPermission[];
  mount?: () => Promise<{ default: FC }> | Promise<any> | any;
}

// OS Window type - ensure it supports our widget apps
export interface OSWindow {
  id: string;
  appId?: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  workspace: string;
  minimized: boolean;
  isMaximized?: boolean;
  opacity?: number;
  Component?: ComponentType<any>;
}
