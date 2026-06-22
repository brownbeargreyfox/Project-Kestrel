// types/plugin.ts
export interface TabDef {
  id: string;
  label: string;
  component: React.ComponentType<any>;
  icon?: React.ComponentType<{ className?: string }>;
  order?: number;
}

export interface WidgetDef {
  id: string;
  title: string;
  component: React.ComponentType<any>;
  sizeHints: {
    minWidth?: number;
    minHeight?: number;
    defaultWidth?: number;
    defaultHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
  category?: string;
  description?: string;
}

export interface EventPayload {
  version: string;
  timestamp: number;
  source: string;
  data: Record<string, any>;
}

export interface HostContext {
  eventBus: EventBus;
  gateway: Gateway;
  storage: StorageAPI;
  theme: ThemeTokens;
  permissions: PermissionChecker;
}

export interface EventBus {
  emit(eventName: string, payload: EventPayload): void;
  subscribe(eventName: string, handler: (payload: EventPayload) => void): () => void;
  unsubscribe(eventName: string, handler: (payload: EventPayload) => void): void;
}

export interface Gateway {
  request<T = any>(endpoint: string, options?: RequestOptions): Promise<T>;
  setAuthToken(token: string): void;
  setRateLimit(requestsPerMinute: number): void;
}

export interface StorageAPI {
  get<T = any>(key: string): T | null;
  set(key: string, value: any): void;
  remove(key: string): void;
  clear(): void;
}

export interface PermissionChecker {
  hasPermission(scope: string): boolean;
  checkPermission(scope: string): void; // throws if missing
  getPermissions(): string[];
}

export interface ThemeTokens {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  typography: Record<string, any>;
  breakpoints: Record<string, string>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  permissions: string[];
  
  // Lifecycle hooks
  init(context: HostContext): Promise<void> | void;
  dispose(): Promise<void> | void;
  
  // Registration methods
  registerTabs(): TabDef[];
  registerWidgets(): WidgetDef[];
  
  // Optional health check
  healthCheck?(): Promise<boolean>;
}

// Permission scopes
export const PERMISSION_SCOPES = {
  UI: {
    TABS: 'ui:tabs',
    WIDGETS: 'ui:widgets',
    NAVIGATION: 'ui:navigation',
  },
  EVENTS: {
    EMIT: 'events:emit',
    SUBSCRIBE: 'events:subscribe',
    SYSTEM: 'events:system',
  },
  DATA: {
    METRICS_READ: 'data:metrics.read',
    INCIDENTS_READ: 'data:incidents.read',
    CONFIG_READ: 'data:config.read',
    CONFIG_WRITE: 'data:config.write',
  },
  ACTIONS: {
    SIMULATE_RUN: 'actions:simulate.run',
    ALERT_CREATE: 'actions:alert.create',
    SYSTEM_RESTART: 'actions:system.restart',
  },
} as const;

export type PermissionScope = 
  | typeof PERMISSION_SCOPES.UI[keyof typeof PERMISSION_SCOPES.UI]
  | typeof PERMISSION_SCOPES.EVENTS[keyof typeof PERMISSION_SCOPES.EVENTS]
  | typeof PERMISSION_SCOPES.DATA[keyof typeof PERMISSION_SCOPES.DATA]
  | typeof PERMISSION_SCOPES.ACTIONS[keyof typeof PERMISSION_SCOPES.ACTIONS];

// Error types
export class PluginError extends Error {
  constructor(
    message: string,
    public code: string,
    public pluginId?: string
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

export class PermissionError extends PluginError {
  constructor(scope: string, pluginId: string) {
    super(`Plugin ${pluginId} missing permission: ${scope}`, 'PERMISSION_DENIED', pluginId);
    this.name = 'PermissionError';
  }
}

// Event schema validation
export interface EventSchema {
  name: string;
  version: string;
  payloadSchema: Record<string, any>; // JSON Schema
}

export const CORE_EVENT_SCHEMAS: EventSchema[] = [
  {
    name: 'simulation.complete',
    version: '1.0',
    payloadSchema: {
      type: 'object',
      required: ['simulationId', 'results', 'duration'],
      properties: {
        simulationId: { type: 'string' },
        results: { type: 'object' },
        duration: { type: 'number' },
        metadata: { type: 'object' }
      }
    }
  },
  {
    name: 'threshold.breach',
    version: '1.0', 
    payloadSchema: {
      type: 'object',
      required: ['metric', 'value', 'threshold', 'severity'],
      properties: {
        metric: { type: 'string' },
        value: { type: 'number' },
        threshold: { type: 'number' },
        severity: { enum: ['warning', 'critical'] },
        context: { type: 'object' }
      }
    }
  },
  {
    name: 'insight.generated',
    version: '1.0',
    payloadSchema: {
      type: 'object',
      required: ['insight', 'confidence', 'source'],
      properties: {
        insight: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        source: { type: 'string' },
        recommendations: { type: 'array' },
        metadata: { type: 'object' }
      }
    }
  }
];

// Request options for gateway
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}