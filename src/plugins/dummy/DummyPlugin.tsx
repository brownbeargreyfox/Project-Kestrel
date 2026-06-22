// src/plugins/dummy/DummyPlugin.tsx
import React from 'react';
import type { PluginManifest, TabDef, WidgetDef, HostContext } from '../../types/plugin';
import { PERMISSION_SCOPES } from '../../types/plugin';
import { Activity, Cpu, Database, TrendingUp } from 'lucide-react';

// Dummy Tab Component
const DummyTabComponent: React.FC = () => {
  const [eventLog, setEventLog] = React.useState<string[]>([]);
  const [metrics, setMetrics] = React.useState({
    requests: 0,
    latency: 0,
    errors: 0
  });

  React.useEffect(() => {
    // Mock some activity
    const interval = setInterval(() => {
      setMetrics(prev => ({
        requests: prev.requests + Math.floor(Math.random() * 10),
        latency: 50 + Math.random() * 100,
        errors: prev.errors + (Math.random() > 0.9 ? 1 : 0)
      }));

      setEventLog(prev => [
        `${new Date().toLocaleTimeString()}: Dummy event generated`,
        ...prev.slice(0, 4)
      ]);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Dummy Plugin Dashboard</h2>
        <p className="text-gray-600">
          This demonstrates the plugin architecture working. This tab and its widgets
          are loaded dynamically from the DummyPlugin.
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Requests</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.requests.toLocaleString()}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Latency</p>
              <p className="text-3xl font-bold text-gray-900">{Math.round(metrics.latency)}ms</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Errors</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.errors}</p>
            </div>
            <Database className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div className="bg-white rounded-lg border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Recent Events</h3>
        </div>
        <div className="p-6">
          <div className="space-y-2">
            {eventLog.map((event, index) => (
              <div key={index} className="text-sm text-gray-600 font-mono">
                {event}
              </div>
            ))}
            {eventLog.length === 0 && (
              <div className="text-sm text-gray-400 italic">No events yet...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Dummy Widget Components
const SystemStatsWidget: React.FC<{ onRemove: () => void }> = ({ onRemove }) => {
  const [stats, setStats] = React.useState({
    cpu: 0,
    memory: 0,
    disk: 0
  });

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        cpu: Math.floor(Math.random() * 100),
        memory: Math.floor(Math.random() * 100),
        disk: Math.floor(Math.random() * 100)
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          System Stats
        </h4>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>CPU</span>
            <span>{stats.cpu}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats.cpu}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Memory</span>
            <span>{stats.memory}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats.memory}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Disk</span>
            <span>{stats.disk}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-yellow-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats.disk}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const EventFeedWidget: React.FC<{ onRemove: () => void }> = ({ onRemove }) => {
  const [events, setEvents] = React.useState<Array<{ time: string; message: string; type: string }>>([]);

  React.useEffect(() => {
    const eventTypes = [
      { type: 'info', messages: ['User logged in', 'Cache cleared', 'Backup completed'] },
      { type: 'warning', messages: ['High memory usage', 'Slow query detected', 'Rate limit approaching'] },
      { type: 'error', messages: ['Connection failed', 'Authentication error', 'Service timeout'] }
    ];

    const interval = setInterval(() => {
      const typeData = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const message = typeData.messages[Math.floor(Math.random() * typeData.messages.length)];

      setEvents(prev => [
        {
          time: new Date().toLocaleTimeString(),
          message,
          type: typeData.type
        },
        ...prev.slice(0, 4)
      ]);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const getEventColor = (type: string) => {
    switch (type) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warning': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium">Event Feed</h4>
        <button
          onClick={onRemove}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ×
        </button>
      </div>

      <div className="space-y-2">
        {events.map((event, index) => (
          <div key={index} className="text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs font-mono">{event.time}</span>
              <span className={`px-2 py-1 rounded text-xs ${getEventColor(event.type)}`}>
                {event.type}
              </span>
            </div>
            <div className="text-gray-700 mt-1">{event.message}</div>
          </div>
        ))}

        {events.length === 0 && (
          <div className="text-gray-400 text-sm italic">Waiting for events...</div>
        )}
      </div>
    </div>
  );
};

// Plugin Implementation
export class DummyPlugin implements PluginManifest {
  id = 'dummy-plugin';
  name = 'Dummy Plugin';
  version = '1.0.0';
  description = 'A demonstration plugin showing the plugin architecture';
  permissions = [
    PERMISSION_SCOPES.UI.TABS,
    PERMISSION_SCOPES.UI.WIDGETS,
    PERMISSION_SCOPES.EVENTS.EMIT,
    PERMISSION_SCOPES.EVENTS.SUBSCRIBE,
    PERMISSION_SCOPES.DATA.METRICS_READ
  ];

  private context?: HostContext;
  private unsubscribers: Array<() => void> = [];

  async init(context: HostContext): Promise<void> {
    this.context = context;

    // Check permissions
    context.permissions.checkPermission(PERMISSION_SCOPES.UI.TABS);
    context.permissions.checkPermission(PERMISSION_SCOPES.UI.WIDGETS);

    // Subscribe to some events
    const unsubscribe1 = context.eventBus.subscribe('threshold.breach', (payload) => {
      console.log('DummyPlugin received threshold breach:', payload);
    });

    const unsubscribe2 = context.eventBus.subscribe('simulation.complete', (payload) => {
      console.log('DummyPlugin received simulation complete:', payload);
    });

    this.unsubscribers.push(unsubscribe1, unsubscribe2);

    // Store some initial data
    context.storage.set('initialized', true);
    context.storage.set('initTime', Date.now());

    // Emit initialization event
    context.eventBus.emit('plugin.initialized', {
      version: '1.0',
      timestamp: Date.now(),
      source: this.id,
      data: {
        pluginId: this.id,
        features: ['system-monitoring', 'event-tracking']
      }
    });

    console.log(`${this.name} initialized successfully`);
  }

  async dispose(): Promise<void> {
    // Clean up subscriptions
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Clear storage if needed
    this.context?.storage.clear();

    // Emit disposal event
    this.context?.eventBus.emit('plugin.disposed', {
      version: '1.0',
      timestamp: Date.now(),
      source: this.id,
      data: { pluginId: this.id }
    });

    console.log(`${this.name} disposed successfully`);
  }

  registerTabs(): TabDef[] {
    return [
      {
        id: 'dummy-dashboard',
        label: 'Dummy Dashboard',
        component: DummyTabComponent,
        icon: Activity,
        order: 99 // Low priority, appears last
      }
    ];
  }

  registerWidgets(): WidgetDef[] {
    return [
      {
        id: 'system-stats',
        title: 'System Stats',
        component: SystemStatsWidget,
        sizeHints: {
          minWidth: 250,
          minHeight: 200,
          defaultWidth: 300,
          defaultHeight: 250
        },
        category: 'monitoring',
        description: 'Real-time system resource monitoring'
      },
      {
        id: 'event-feed',
        title: 'Event Feed',
        component: EventFeedWidget,
        sizeHints: {
          minWidth: 280,
          minHeight: 180,
          defaultWidth: 320,
          defaultHeight: 240
        },
        category: 'monitoring',
        description: 'Live feed of system events'
      }
    ];
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if we can access storage
      const initialized = this.context?.storage.get('initialized');
      return !!initialized;
    } catch (error) {
      console.error('DummyPlugin health check failed:', error);
      return false;
    }
  }
}

// Factory function for plugin loading
export const createPlugin = (): PluginManifest => {
  return new DummyPlugin();
};

export const createDummyPlugin = createPlugin;

// Plugin metadata for remote loading
export const PLUGIN_METADATA = {
  id: 'dummy-plugin',
  name: 'Dummy Plugin',
  version: '1.0.0',
  description: 'A demonstration plugin showing the plugin architecture',
  author: 'Kestrel Team',
  homepage: 'https://github.com/kestrel/dummy-plugin',
  repository: 'https://github.com/kestrel/dummy-plugin.git',
  license: 'MIT',
  keywords: ['demo', 'monitoring', 'example'],
  engines: {
    kestrel: '>=0.1.0'
  },
  permissions: [
    PERMISSION_SCOPES.UI.TABS,
    PERMISSION_SCOPES.UI.WIDGETS,
    PERMISSION_SCOPES.EVENTS.EMIT,
    PERMISSION_SCOPES.EVENTS.SUBSCRIBE,
    PERMISSION_SCOPES.DATA.METRICS_READ
  ],
  // For remote loading security
  integrity: 'sha384-...',
  signature: 'base64-encoded-signature'
};
