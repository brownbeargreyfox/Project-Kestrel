// src/store/pluginStore.ts - Plugin slice for Zustand store
import { StateCreator } from 'zustand';
import { TabDef, WidgetDef } from '../types/plugin';

export interface PluginState {
  // Plugin system state
  enabled: boolean;
  registeredTabs: TabDef[];
  registeredWidgets: WidgetDef[];
  pluginStatuses: Array<{ id: string; name: string; status: string }>;
  
  // UI state
  activePluginTab: string | null;
  visibleWidgets: string[];
  pluginPanelOpen: boolean;
  
  // Migration state
  migrationFlags: Record<string, boolean>;
  migrationInProgress: boolean;
  
  // Actions
  updatePluginStore: (updates: Partial<PluginState>) => void;
  setActivePluginTab: (tabId: string | null) => void;
  toggleWidget: (widgetId: string) => void;
  setPluginPanelOpen: (open: boolean) => void;
  setMigrationFlag: (componentId: string, usePlugin: boolean) => void;
  setMigrationInProgress: (inProgress: boolean) => void;
  resetPluginState: () => void;
}

export const createPluginSlice: StateCreator<PluginState> = (set, get) => ({
  // Initial state
  enabled: false,
  registeredTabs: [],
  registeredWidgets: [],
  pluginStatuses: [],
  activePluginTab: null,
  visibleWidgets: [],
  pluginPanelOpen: false,
  migrationFlags: {},
  migrationInProgress: false,
  
  // Actions
  updatePluginStore: (updates) => {
    set((state) => ({ ...state, ...updates }));
  },
  
  setActivePluginTab: (tabId) => {
    set({ activePluginTab: tabId });
  },
  
  toggleWidget: (widgetId) => {
    set((state) => ({
      visibleWidgets: state.visibleWidgets.includes(widgetId)
        ? state.visibleWidgets.filter(id => id !== widgetId)
        : [...state.visibleWidgets, widgetId]
    }));
  },
  
  setPluginPanelOpen: (open) => {
    set({ pluginPanelOpen: open });
  },
  
  setMigrationFlag: (componentId, usePlugin) => {
    set((state) => ({
      migrationFlags: {
        ...state.migrationFlags,
        [componentId]: usePlugin
      }
    }));
  },
  
  setMigrationInProgress: (inProgress) => {
    set({ migrationInProgress: inProgress });
  },
  
  resetPluginState: () => {
    set({
      enabled: false,
      registeredTabs: [],
      registeredWidgets: [],
      pluginStatuses: [],
      activePluginTab: null,
      visibleWidgets: [],
      pluginPanelOpen: false,
      migrationFlags: {},
      migrationInProgress: false
    });
  }
});

// Integration with existing useDashboardStore.js
// Add this to your existing store file:

/*
// In your existing useDashboardStore.js, add the plugin slice:

import { createPluginSlice } from './pluginStore';

export const useDashboardStore = create((set, get, api) => ({
  // ... your existing state ...
  
  // Plugin slice
  ...createPluginSlice(set, get, api),
  
  // ... rest of your store
}));
*/

// Selectors for efficient component subscriptions
export const pluginSelectors = {
  // Basic state
  isPluginSystemEnabled: (state: PluginState) => state.enabled,
  getRegisteredTabs: (state: PluginState) => state.registeredTabs,
  getRegisteredWidgets: (state: PluginState) => state.registeredWidgets,
  getPluginStatuses: (state: PluginState) => state.pluginStatuses,
  
  // UI state
  getActivePluginTab: (state: PluginState) => state.activePluginTab,
  getVisibleWidgets: (state: PluginState) => state.visibleWidgets,
  isPluginPanelOpen: (state: PluginState) => state.pluginPanelOpen,
  
  // Migration state
  getMigrationFlags: (state: PluginState) => state.migrationFlags,
  isMigrationInProgress: (state: PluginState) => state.migrationInProgress,
  isComponentMigrated: (componentId: string) => (state: PluginState) => 
    state.migrationFlags[componentId] ?? false,
  
  // Computed values
  getActiveTabData: (state: PluginState) => {
    if (!state.activePluginTab) return null;
    return state.registeredTabs.find(tab => tab.id === state.activePluginTab) || null;
  },
  
  getVisibleWidgetData: (state: PluginState) => {
    return state.registeredWidgets.filter(widget => 
      state.visibleWidgets.includes(widget.id)
    );
  },
  
  getPluginHealth: (state: PluginState) => {
    const total = state.pluginStatuses.length;
    const active = state.pluginStatuses.filter(p => p.status === 'active').length;
    const errors = state.pluginStatuses.filter(p => p.status === 'error').length;
    
    return {
      total,
      active,
      errors,
      disabled: total - active - errors,
      healthScore: total > 0 ? Math.round((active / total) * 100) : 100
    };
  },
  
  getMigrationProgress: (state: PluginState) => {
    const flags = Object.values(state.migrationFlags);
    const total = flags.length;
    const migrated = flags.filter(Boolean).length;
    
    return {
      total,
      migrated,
      remaining: total - migrated,
      percentage: total > 0 ? Math.round((migrated / total) * 100) : 0
    };
  }
};

// React hooks for component integration
export const usePluginTabs = () => {
  const tabs = useDashboardStore(pluginSelectors.getRegisteredTabs);
  const activeTab = useDashboardStore(pluginSelectors.getActivePluginTab);
  const setActiveTab = useDashboardStore(state => state.setActivePluginTab);
  
  return { tabs, activeTab, setActiveTab };
};

export const usePluginWidgets = () => {
  const widgets = useDashboardStore(pluginSelectors.getRegisteredWidgets);
  const visibleWidgets = useDashboardStore(pluginSelectors.getVisibleWidgets);
  const toggleWidget = useDashboardStore(state => state.toggleWidget);
  
  return { widgets, visibleWidgets, toggleWidget };
};

export const usePluginMigration = () => {
  const migrationFlags = useDashboardStore(pluginSelectors.getMigrationFlags);
  const inProgress = useDashboardStore(pluginSelectors.isMigrationInProgress);
  const progress = useDashboardStore(pluginSelectors.getMigrationProgress);
  const setMigrationFlag = useDashboardStore(state => state.setMigrationFlag);
  const setInProgress = useDashboardStore(state => state.setMigrationInProgress);
  
  return {
    migrationFlags,
    inProgress,
    progress,
    setMigrationFlag,
    setInProgress
  };
};

export const usePluginHealth = () => {
  const statuses = useDashboardStore(pluginSelectors.getPluginStatuses);
  const health = useDashboardStore(pluginSelectors.getPluginHealth);
  
  return { statuses, health };
};

// Persistence middleware for migration flags
export const createPluginPersistence = () => ({
  name: 'kestrel-plugin-state',
  partialize: (state: any) => ({
    migrationFlags: state.migrationFlags,
    visibleWidgets: state.visibleWidgets,
    activePluginTab: state.activePluginTab
  }),
  version: 1,
  migrate: (persistedState: any, version: number) => {
    // Handle migration of persisted state if needed
    if (version < 1) {
      return {
        ...persistedState,
        migrationFlags: persistedState.migrationFlags || {}
      };
    }
    return persistedState;
  }
});

// Example of how to integrate with existing store
export const integratePluginStore = (existingStore: any) => {
  return {
    ...existingStore,
    ...createPluginSlice(existingStore.set, existingStore.get, existingStore),
    
    // Override or extend existing actions if needed
    resetStore: () => {
      existingStore.resetStore?.(); // Call existing reset if it exists
      existingStore.resetPluginState();
    }
  };
};