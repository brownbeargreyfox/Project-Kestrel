// src/core/LegacyBridge.tsx — Refactored
// - Uses safeLazy to avoid runtime crashes when a chunk fails to load
// - Corrects known paths (Infrastructure/Simulation Planner -> plugins/infrastructure/SimulationPlanPane.jsx)
// - Keeps legacy imports explicitly suffixed with extensions
// - Adds clean legacy-fallback toggle
// - Exposes tab/widget resolvers as before

import React from "react";
import { PluginManager } from "./PluginManager";
import type { TabDef, WidgetDef } from "../types/plugin";

/** Lazy loader with runtime guard (does not fix missing files at build time). */
function safeLazy<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  name: string
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      console.error(`[LegacyBridge] Failed to lazy-load "${name}"`, err);
      const Fallback: React.FC<any> = (props) => (
        <div className="p-4 text-sm text-red-400">
          Failed to load {name}
        </div>
      );
      // @ts-expect-error - returning a compatible module shape
      return { default: Fallback };
    }
  });
}

interface LegacyComponent {
  id: string;
  type: "tab" | "widget";
  name: string; // Display name
  component: React.ComponentType<any>;
  metadata?: {
    originalPath?: string;
    pluginCandidate?: string; // Which plugin should replace this
    migrationPriority?: "high" | "medium" | "low";
    dependencies?: string[]; // Other components this depends on
  };
}

interface MigrationStatus {
  total: number;
  migrated: number;
  remaining: number;
  percentage: number;
  components: Array<{
    id: string;
    type: "tab" | "widget";
    name: string;
    migrated: boolean;
    pluginId?: string;
    flagEnabled: boolean;
  }>;
  byType: {
    tabs: { total: number; migrated: number };
    widgets: { total: number; migrated: number };
  };
}

export class LegacyBridge {
  private pluginManager: PluginManager;
  private legacyComponents = new Map<string, LegacyComponent>();
  private migrationFlags = new Map<string, boolean>();

  constructor(pluginManager: PluginManager) {
    this.pluginManager = pluginManager;
    this.initializeLegacyComponents();
  }

  private initializeLegacyComponents(): void {
    // === AIDA / Infra ===
    this.registerLegacyComponent({
      id: "infrastructure-tab",
      type: "tab",
      name: "Infrastructure",
      // Corrected path to real file under plugins
      component: safeLazy(
        () => import("../plugins/infrastructure/SimulationPlanPane.jsx"),
        "Infrastructure (SimulationPlanPane)"
      ),
      metadata: {
        originalPath: "plugins/infrastructure/SimulationPlanPane.jsx",
        pluginCandidate: "aida",
        migrationPriority: "high",
      },
    });

    this.registerLegacyComponent({
      id: "simulation-planner",
      type: "widget",
      name: "Simulation Planner",
      // Map to the same infra pane for now (until a dedicated planner module exists)
      component: safeLazy(
        () => import("../plugins/infrastructure/SimulationPlanPane.jsx"),
        "Simulation Planner (SimulationPlanPane)"
      ),
      metadata: {
        originalPath: "plugins/infrastructure/SimulationPlanPane.jsx",
        pluginCandidate: "aida",
        migrationPriority: "high",
        dependencies: ["infrastructure-tab"],
      },
    });

    // === Other legacy entries (ensure these files exist or provide shims) ===
    this.registerLegacyComponent({
      id: "root-cause-canvas",
      type: "widget",
      name: "Root Cause Canvas",
      component: safeLazy(
        () => import("../components/legacy/RootCauseCanvas.tsx"),
        "Root Cause Canvas"
      ),
      metadata: {
        originalPath: "components/analysis/RootCauseCanvas.tsx",
        pluginCandidate: "aida",
        migrationPriority: "medium",
      },
    });

    this.registerLegacyComponent({
      id: "performance-monitor",
      type: "widget",
      name: "Performance Monitor",
      component: safeLazy(
        () => import("../components/legacy/PerformanceMonitor.tsx"),
        "Performance Monitor"
      ),
      metadata: {
        originalPath: "components/monitoring/PerformanceMonitor.tsx",
        pluginCandidate: "aida",
        migrationPriority: "high",
      },
    });

    // === MAIA ===
    this.registerLegacyComponent({
      id: "insights-tab",
      type: "tab",
      name: "Insights",
      component: safeLazy(
        () => import("../components/legacy/InsightsTab.tsx"),
        "Insights Tab"
      ),
      metadata: {
        originalPath: "components/insights/InsightsTab.tsx",
        pluginCandidate: "maia",
        migrationPriority: "high",
      },
    });

    this.registerLegacyComponent({
      id: "recommendations-panel",
      type: "widget",
      name: "Recommendations",
      component: safeLazy(
        () => import("../components/legacy/RecommendationsPanel.tsx"),
        "Recommendations Panel"
      ),
      metadata: {
        originalPath: "components/recommendations/RecommendationsPanel.tsx",
        pluginCandidate: "maia",
        migrationPriority: "high",
        dependencies: ["insights-tab"],
      },
    });

    this.registerLegacyComponent({
      id: "insight-badge",
      type: "widget",
      name: "Insight Badge",
      component: safeLazy(
        () => import("../components/legacy/InsightBadge.tsx"),
        "Insight Badge"
      ),
      metadata: {
        originalPath: "components/insights/InsightBadge.tsx",
        pluginCandidate: "maia",
        migrationPriority: "medium",
      },
    });

    this.registerLegacyComponent({
      id: "memory-browser",
      type: "widget",
      name: "Memory Browser",
      component: safeLazy(
        () => import("../components/legacy/MemoryBrowser.tsx"),
        "Memory Browser"
      ),
      metadata: {
        originalPath: "components/memory/MemoryBrowser.tsx",
        pluginCandidate: "maia",
        migrationPriority: "low",
      },
    });

    // Default all to legacy (plugin disabled) initially
    Array.from(this.legacyComponents.keys()).forEach((id) => {
      this.migrationFlags.set(id, false);
    });
  }

  registerLegacyComponent(component: LegacyComponent): void {
    this.legacyComponents.set(component.id, component);
    if (!this.migrationFlags.has(component.id)) this.migrationFlags.set(component.id, false);
  }

  /** Enhanced component resolution — prefer plugin, fallback to legacy (unless disabled). */
  getComponent(id: string, type: "tab" | "widget"): React.ComponentType<any> | null {
    const usePlugin = this.migrationFlags.get(id) ?? false;

    if (usePlugin) {
      const pluginComponent = this.getPluginComponent(id, type);
      if (pluginComponent) return this.wrapPluginComponent(pluginComponent, id, type);

      const allowLegacyFallback = import.meta.env.VITE_ENABLE_LEGACY !== "false";
      if (!allowLegacyFallback) {
        console.warn(
          `[LegacyBridge] Plugin flag enabled for ${id} but plugin component missing; legacy fallback disabled.`
        );
        return null;
      }
      console.warn(
        `[LegacyBridge] Plugin flag enabled for ${id} but plugin component missing; falling back to legacy.`
      );
    }

    const legacy = this.legacyComponents.get(id);
    if (legacy && legacy.type === type) {
      return this.wrapLegacyComponent(legacy, id);
    }

    return null;
  }

  // --- Tabs ---
  getTab(id: string): ExtendedTabDef | null {
    const usePlugin = this.migrationFlags.get(id) ?? false;

    if (usePlugin) {
      const pluginTab = this.pluginManager.getRegisteredTabs().find((t) => t.id === id);
      if (pluginTab) return { ...pluginTab, isLegacy: false, migrationSource: "plugin" };
    }

    const legacy = this.legacyComponents.get(id);
    if (legacy && legacy.type === "tab") {
      return {
        id,
        label: legacy.name,
        component: legacy.component,
        pluginId: "legacy",
        isLegacy: true,
        migrationSource: "legacy",
        metadata: legacy.metadata,
      };
    }

    return null;
  }

  // --- Widgets ---
  getWidget(id: string): ExtendedWidgetDef | null {
    const usePlugin = this.migrationFlags.get(id) ?? false;

    if (usePlugin) {
      const pluginWidget = this.pluginManager.getRegisteredWidgets().find((w) => w.id === id);
      if (pluginWidget) return { ...pluginWidget, isLegacy: false, migrationSource: "plugin" };
    }

    const legacy = this.legacyComponents.get(id);
    if (legacy && legacy.type === "widget") {
      return {
        id,
        title: legacy.name,
        component: legacy.component,
        pluginId: "legacy",
        sizeHints: { defaultWidth: 400, defaultHeight: 300 },
        isLegacy: true,
        migrationSource: "legacy",
        metadata: legacy.metadata,
      };
    }

    return null;
  }

  getAllTabs(): ExtendedTabDef[] {
    const pluginTabs = this.pluginManager
      .getRegisteredTabs()
      .map((tab) => ({ ...tab, isLegacy: false as const, migrationSource: "plugin" as const }));

    const legacyTabs = Array.from(this.legacyComponents.entries())
      .filter(([id, c]) => (this.migrationFlags.get(id) ?? false) === false && c.type === "tab")
      .map(([id, c]) => ({
        id,
        label: c.name,
        component: c.component,
        pluginId: "legacy" as any,
        isLegacy: true as const,
        migrationSource: "legacy" as const,
        metadata: c.metadata,
      }));

    return [...pluginTabs, ...legacyTabs];
  }

  getAllWidgets(): ExtendedWidgetDef[] {
    const pluginWidgets = this.pluginManager
      .getRegisteredWidgets()
      .map((w) => ({ ...w, isLegacy: false as const, migrationSource: "plugin" as const }));

    const legacyWidgets = Array.from(this.legacyComponents.entries())
      .filter(([id, c]) => (this.migrationFlags.get(id) ?? false) === false && c.type === "widget")
      .map(([id, c]) => ({
        id,
        title: c.name,
        component: c.component,
        pluginId: "legacy" as any,
        sizeHints: { defaultWidth: 400, defaultHeight: 300 },
        isLegacy: true as const,
        migrationSource: "legacy" as const,
        metadata: c.metadata,
      }));

    return [...pluginWidgets, ...legacyWidgets];
  }

  getMigrationStatus(): MigrationStatus {
    const components = Array.from(this.legacyComponents.entries()).map(([id, c]) => {
      const flagEnabled = this.migrationFlags.get(id) ?? false;
      const actuallyMigrated = this.isActuallyMigrated(id, c.type);
      let pluginId: string | undefined;

      if (actuallyMigrated) {
        const tab = this.pluginManager.getRegisteredTabs().find((t) => t.id === id);
        const widget = this.pluginManager.getRegisteredWidgets().find((w) => w.id === id);
        pluginId = tab?.pluginId || widget?.pluginId;
      }

      return { id, type: c.type, name: c.name, migrated: actuallyMigrated, pluginId, flagEnabled };
    });

    const total = components.length;
    const migrated = components.filter((c) => c.migrated).length;
    const tabs = components.filter((c) => c.type === "tab");
    const widgets = components.filter((c) => c.type === "widget");

    return {
      total,
      migrated,
      remaining: total - migrated,
      percentage: total > 0 ? Math.round((migrated / total) * 100) : 100,
      components,
      byType: {
        tabs: { total: tabs.length, migrated: tabs.filter((t) => t.migrated).length },
        widgets: { total: widgets.length, migrated: widgets.filter((w) => w.migrated).length },
      },
    };
  }

  setMigrationFlag(id: string, usePlugin: boolean): void {
    this.migrationFlags.set(id, usePlugin);
  }

  migrateComponent(id: string): boolean {
    const component = this.legacyComponents.get(id);
    if (!component) return false;

    if (this.isPluginComponentAvailable(id, component.type)) {
      this.setMigrationFlag(id, true);
      return true;
    }

    console.warn(`Cannot migrate ${id}: plugin component not available`);
    return false;
  }

  migrateByPlugin(pluginId: string): string[] {
    const migrated: string[] = [];

    Array.from(this.legacyComponents.entries()).forEach(([id, c]) => {
      if (c.metadata?.pluginCandidate === pluginId) {
        if (this.migrateComponent(id)) migrated.push(id);
      }
    });

    return migrated;
  }

  revertToLegacy(ids: string[]): void {
    ids.forEach((id) => this.setMigrationFlag(id, false));
  }

  private getPluginComponent(id: string, type: "tab" | "widget"): React.ComponentType<any> | null {
    if (type === "tab") {
      const tab = this.pluginManager.getRegisteredTabs().find((t) => t.id === id);
      return tab?.component || null;
    }
    const widget = this.pluginManager.getRegisteredWidgets().find((w) => w.id === id);
    return widget?.component || null;
  }

  private isPluginComponentAvailable(id: string, type: "tab" | "widget"): boolean {
    return this.getPluginComponent(id, type) !== null;
  }

  private isActuallyMigrated(id: string, type: "tab" | "widget"): boolean {
    const flagEnabled = this.migrationFlags.get(id) ?? false;
    if (!flagEnabled) return false;
    return this.isPluginComponentAvailable(id, type);
  }

  private wrapPluginComponent(
    Component: React.ComponentType<any>,
    id: string,
    type: "tab" | "widget"
  ): React.ComponentType<any> {
    return React.forwardRef<any, any>((props, ref) => (
      <div data-plugin-component={id} data-component-type={type}>
        <Component {...props} ref={ref} />
      </div>
    ));
  }

  private wrapLegacyComponent(component: LegacyComponent, id: string): React.ComponentType<any> {
    const Component = component.component;

    return React.forwardRef<any, any>((props, ref) => (
      <div data-legacy-component={id} data-component-type={component.type}>
        <React.Suspense
          fallback={<div className="p-4 text-gray-500 animate-pulse">Loading {component.name}...</div>}
        >
          <Component {...props} ref={ref} />
        </React.Suspense>
      </div>
    ));
  }

  exportMigrationConfig(): Record<string, boolean> {
    return Object.fromEntries(this.migrationFlags);
  }

  importMigrationConfig(config: Record<string, boolean>): void {
    Object.entries(config).forEach(([id, usePlugin]) => {
      if (this.legacyComponents.has(id)) this.setMigrationFlag(id, usePlugin);
    });
  }
}

// --- Extended types ---
export interface ExtendedTabDef extends TabDef {
  isLegacy: boolean;
  migrationSource: "plugin" | "legacy";
  metadata?: any;
}

export interface ExtendedWidgetDef extends WidgetDef {
  isLegacy: boolean;
  migrationSource: "plugin" | "legacy";
  metadata?: any;
}

// --- Resolvers for AppRegistry / Widget shells ---
export const createTabResolver = (bridge: LegacyBridge) => (tabId: string) => {
  const tab = bridge.getTab(tabId);
  if (!tab) return null;
  return {
    id: tab.id,
    name: tab.label,
    component: tab.component,
    icon: (tab as any).icon,
    isLegacy: tab.isLegacy,
    pluginId: tab.pluginId,
  };
};

export const createWidgetResolver = (bridge: LegacyBridge) => (widgetId: string) => {
  const widget = bridge.getWidget(widgetId);
  if (!widget) return null;
  return {
    id: widget.id,
    title: widget.title,
    component: widget.component,
    defaultSize: {
      width: widget.sizeHints?.defaultWidth || 400,
      height: widget.sizeHints?.defaultHeight || 300,
    },
    isLegacy: widget.isLegacy,
    pluginId: widget.pluginId,
  };
};
