// src/components/os/PluginProvider.tsx - Fixed per-plugin isolation (patched)
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { PluginManager, PluginLoader, EventBusImpl } from '../../core';
import * as GatewayLib from '../../lib/gateway';
import { PermissionManager } from '../../core/PermissionManager';
import { StorageImpl } from '../../core/Storage';
import { ThemeManager } from '../../core/ThemeManager';
import type { HostContext } from '../../types/plugin';
import { usePluginStore } from '../../store/usePluginStore';
import { AppErrorBoundary } from './AppErrorBoundary';
import { sanitizeTabs, sanitizeWidgets, deepStripComponents } from '../../store/pluginSanitizers';

interface PluginContextValue {
  pluginManager: PluginManager;
  pluginLoader: PluginLoader;
  eventBus: EventBusImpl;
  isPluginSystemEnabled: boolean;
  togglePluginSystem: () => void;
  loadPlugin: (pluginId: string, source?: any) => Promise<void>;
  unloadPlugin: (pluginId: string) => Promise<void>;
}

const PluginContext = createContext<PluginContextValue | null>(null);

export const usePluginSystem = () => {
  const context = useContext(PluginContext);
  if (!context) throw new Error('usePluginSystem must be used within PluginProvider');
  return context;
};

interface PluginProviderProps {
  children: React.ReactNode;
  enabledByDefault?: boolean;
}

// ---- Gateway adapter & proxy ----------------------------------------------
// Minimal shape the provider depends on
 type GatewayLike = {
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<any>;
  setAuthToken?: (token: string) => void;
  setRateLimit?: (rpm: number) => void;
  [k: string]: any;
};

// Create a base gateway from whatever the lib exports (factory/class/default)
function createBaseGateway(opts?: any): GatewayLike {
  const G: any = GatewayLib as any;
  if (G.GatewayImpl) return new G.GatewayImpl(opts);
  if (typeof G.createGateway === 'function') return G.createGateway(opts);
  if (typeof G.default === 'function') return new G.default(opts);
  if (typeof G.gateway === 'function') return G.gateway(opts);
  // last resort: thin wrapper over fetch; proxy still injects headers
  return { request: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init) };
}

// Gateway proxy that adds plugin ID header
class PluginGatewayProxy {
  constructor(
    private gateway: GatewayLike,
    private pluginId: string
  ) {}

  async request<T = any>(endpoint: string, options: any = {}): Promise<T> {
    const headers = {
      'X-Kestrel-Plugin': this.pluginId,
      ...options.headers,
    };
    return this.gateway.request(endpoint, { ...options, headers });
  }

  setAuthToken(token: string): void {
    this.gateway.setAuthToken?.(token);
  }

  setRateLimit(requestsPerMinute: number): void {
    this.gateway.setRateLimit?.(requestsPerMinute);
  }
}

export const PluginProvider: React.FC<PluginProviderProps> = ({
  children,
  enabledByDefault = import.meta.env.VITE_PLUGINS_ENABLED === 'true',
}) => {
  const [isPluginSystemEnabled, setIsPluginSystemEnabled] = useState(enabledByDefault);

  // Initialize core plugin services
  const services = useMemo(() => {
    const eventBus = new EventBusImpl();
    const gateway = createBaseGateway();
    const permissionManager = new PermissionManager();
    const themeManager = new ThemeManager();

    const pluginManager = new PluginManager(
      eventBus,
      gateway,
      permissionManager,
      themeManager.getTheme()
    );

    const pluginLoader = new PluginLoader({
      allowRemotePlugins: import.meta.env.DEV,
      allowUnsignedPlugins: true,
      maxPluginSize: 10 * 1024 * 1024, // 10MB
      timeout: 30000,
    });

    return {
      eventBus,
      gateway,
      permissionManager,
      themeManager,
      pluginManager,
      pluginLoader,
    };
  }, []);

  // Enhanced sync with Zustand - serializable data only
  const updatePluginStore = usePluginStore((state) => state.updatePluginStore);

  const syncPluginStateToStore = React.useCallback(() => {
    if (!isPluginSystemEnabled) {
      updatePluginStore({
        enabled: false,
        tabs: [],
        widgets: [],
        statuses: {},
      });
      return;
    }

    // Convert runtime registry → JSON-safe DTOs
    const tabs = sanitizeTabs(services.pluginManager.getRegisteredTabs());
    const widgets = sanitizeWidgets(services.pluginManager.getRegisteredWidgets());

    // Serialize plugin statuses
    const statusArray = services.pluginManager.getAllPluginStatuses();
    const statuses = statusArray.reduce((acc, { id, name, status }) => {
      acc[id] = { status, name };
      return acc;
    }, {} as Record<string, { status: string; name: string }>);

    updatePluginStore(
      deepStripComponents({
        enabled: isPluginSystemEnabled,
        tabs,
        widgets,
        statuses,
      })
    );
  }, [isPluginSystemEnabled, services, updatePluginStore]);

  useEffect(() => {
    if (!isPluginSystemEnabled) return;

    // Listen for plugin lifecycle events
    const unsubscribeLoaded = services.eventBus.subscribe('plugin.loaded', syncPluginStateToStore);
    const unsubscribeUnloaded = services.eventBus.subscribe('plugin.unloaded', syncPluginStateToStore);
    const unsubscribeError = services.eventBus.subscribe('plugin.error', syncPluginStateToStore);

    // Initial sync
    syncPluginStateToStore();

    return () => {
      unsubscribeLoaded();
      unsubscribeUnloaded();
      unsubscribeError();
    };
  }, [isPluginSystemEnabled, services, syncPluginStateToStore]);

  // Enhanced plugin loading with per-plugin isolation
  const loadPlugin = async (pluginId: string, source?: any) => {
    if (!isPluginSystemEnabled) throw new Error('Plugin system is disabled');

    try {
      const pluginSource = source || {
        type: 'bundled' as const,
        id: pluginId,
        name: `${pluginId} Plugin`,
        version: '1.0.0',
      };

      const plugin = await services.pluginLoader.loadPlugin(pluginSource);

      // Create per-plugin isolated context
      const pluginStorage = new StorageImpl(`kestrel:${pluginId}`);
      const pluginGateway = new PluginGatewayProxy(services.gateway, pluginId);
      const pluginPermissions = services.permissionManager.createChecker(pluginId, (plugin as any).permissions || []);

      const pluginHostContext: HostContext = {
        eventBus: services.eventBus,
        gateway: pluginGateway,
        storage: pluginStorage,
        theme: services.themeManager.getTheme(),
        permissions: pluginPermissions,
      };

      // Load plugin with isolated context
      await services.pluginManager.loadPlugin(plugin, pluginHostContext);
      console.log(`Plugin ${pluginId} loaded successfully with isolated context`);
    } catch (error) {
      console.error(`Failed to load plugin ${pluginId}:`, error);
      throw error;
    }
  };

  const unloadPlugin = async (pluginId: string) => {
    if (!isPluginSystemEnabled) return;
    try {
      await services.pluginManager.unloadPlugin(pluginId);
      services.pluginLoader.unloadPlugin(pluginId);
      console.log(`Plugin ${pluginId} unloaded successfully`);
    } catch (error) {
      console.error(`Failed to unload plugin ${pluginId}:`, error);
      throw error;
    }
  };

  const togglePluginSystem = () => setIsPluginSystemEnabled((prev) => !prev);

  // Auto-load development plugins (opt-in via env)
  useEffect(() => {
    if (!isPluginSystemEnabled || !import.meta.env.DEV) return;

    const autoloadPlugins = (import.meta.env.VITE_AUTOLOAD_PLUGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (autoloadPlugins.length === 0) autoloadPlugins.push('dummy');

    const loadDevelopmentPlugins = async () => {
      for (const pluginId of autoloadPlugins) {
        try {
          await loadPlugin(pluginId);
        } catch (error) {
          console.warn(`Failed to auto-load dev plugin ${pluginId}:`, error);
        }
      }
    };

    const timer = setTimeout(loadDevelopmentPlugins, 100);
    return () => clearTimeout(timer);
  }, [isPluginSystemEnabled, loadPlugin]);

  const contextValue: PluginContextValue = {
    pluginManager: services.pluginManager,
    pluginLoader: services.pluginLoader,
    eventBus: services.eventBus,
    isPluginSystemEnabled,
    togglePluginSystem,
    loadPlugin,
    unloadPlugin,
  };

  return <PluginContext.Provider value={contextValue}>{children}</PluginContext.Provider>;
};

// Enhanced plugin component wrapper with proper error boundary
export const withPluginErrorBoundary = <P extends object>(
  WrappedComponent: React.ComponentType<P>,
  pluginId: string,
  componentType: 'tab' | 'widget' = 'widget'
) => {
  return React.forwardRef<any, P>((props, ref) => {
    const { pluginManager, eventBus } = usePluginSystem();

    const handleError = (error: Error, errorInfo: any) => {
      console.error(`Plugin ${pluginId} ${componentType} error:`, error, errorInfo);

      // Emit error event
      eventBus.emit('plugin.component.error', {
        version: '1.0',
        timestamp: Date.now(),
        source: pluginId,
        data: {
          pluginId,
          componentType,
          error: error.message,
          stack: error.stack,
        },
      });
    };

    const handleRecover = () => {
      // Attempt to recover by reloading the plugin (you can wire a reload here)
      console.log(`Attempting to recover plugin ${pluginId}`);
    };

    const handleDisable = () => {
      pluginManager.killSwitch(pluginId);
    };

    return (
      <AppErrorBoundary
        onError={handleError}
        fallback={({ error, retry }) => (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <h4 className="font-medium text-red-800">Plugin Error</h4>
            </div>
            <p className="text-sm text-red-600 mb-3">
              Plugin "{pluginId}" {componentType} encountered an error: {error.message}
            </p>
            <div className="flex gap-2">
              <button
                onClick={retry}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                Retry
              </button>
              <button
                onClick={handleRecover}
                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
              >
                Recover
              </button>
              <button
                onClick={handleDisable}
                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Disable Plugin
              </button>
            </div>
          </div>
        )}
      >
        <div data-plugin-component={pluginId} data-component-type={componentType}>
          <WrappedComponent {...(props as P)} ref={ref} />
        </div>
      </AppErrorBoundary>
    );
  });
};
