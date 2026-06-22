// src/store/usePluginStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PersistedTabDTO,
  PersistedWidgetDTO,
} from '../types/plugin-runtime';

type PluginStatuses = Record<string, { status: string; name?: string }>;

type PluginState = {
  // persisted
  enabled: boolean;
  flags: Record<string, boolean>;
  tabs: PersistedTabDTO[];
  widgets: PersistedWidgetDTO[];
  statuses: PluginStatuses;

  // actions
  updatePluginStore: (patch: Partial<PluginState>) => void;
  setEnabled: (v: boolean) => void;
  setFlag: (key: string, v: boolean) => void;
  reset: () => void;
};

export const usePluginStore = create<PluginState>()(
  persist(
    (set) => ({
      enabled: false,
      flags: {},
      tabs: [],
      widgets: [],
      statuses: {},

      updatePluginStore: (patch) => set((s) => ({ ...s, ...patch })),
      setEnabled: (v) => set(() => ({ enabled: v })),
      setFlag: (key, v) =>
        set((s) => ({ flags: { ...s.flags, [key]: v } })),
      reset: () =>
        set(() => ({
          enabled: false,
          flags: {},
          tabs: [],
          widgets: [],
          statuses: {},
        })),
    }),
    {
      name: 'kestrel:plugins',
      // only JSON-safe keys
      partialize: (s) => ({
        enabled: s.enabled,
        flags: s.flags,
        tabs: s.tabs,
        widgets: s.widgets,
        statuses: s.statuses,
      }),
    }
  )
);

// tiny selectors (optional)
export const selectTabsByPlugin = (pluginId: string) => (s: PluginState) =>
  s.tabs.filter((t) => t.pluginId === pluginId);

export const selectWidgetsByPlugin = (pluginId: string) => (s: PluginState) =>
  s.widgets.filter((w) => w.pluginId === pluginId);

export const selectMigrationProgress = (s: PluginState) => {
  const total = s.widgets.length + s.tabs.length;
  const migrated = Object.values(s.statuses).filter(
    (st) => st.status === 'loaded' || st.status === 'active'
  ).length;
  return total ? Math.round((migrated / total) * 100) : 0;
};
