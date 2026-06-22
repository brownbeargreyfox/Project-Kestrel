// src/types/plugin-runtime.ts
import type React from 'react';

/** Common props you pass into all plugin widgets (adjust as needed) */
export interface WidgetBaseProps {
  onRemove?: () => void;
}

/** Runtime registry objects (contain React components; NEVER persist) */
export interface PluginTabRuntime<P = {}> {
  id: string;
  label: string;
  component: React.ComponentType<P>;
  pluginId: string;
  order?: number;
  isLegacy?: boolean;
}

export interface PluginWidgetRuntime<P = WidgetBaseProps> {
  id: string;
  title: string;
  component: React.ComponentType<P>;
  pluginId: string;
  sizeHints?: { defaultWidth: number; defaultHeight: number };
  category?: string;
  isLegacy?: boolean;
}

/** Persisted/transport DTOs (JSON only; NO React values) */
export interface PersistedTabDTO {
  id: string;
  label: string;
  pluginId: string;
  order?: number;
  isLegacy?: boolean;
}

export interface PersistedWidgetDTO {
  id: string;
  title: string;
  pluginId: string;
  sizeHints?: { defaultWidth: number; defaultHeight: number };
  category?: string;
  isLegacy?: boolean;
}
