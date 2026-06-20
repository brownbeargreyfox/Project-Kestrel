// File: src/api/system.js
// Central System Instance - Intelligently combines both evolution systems

import { createDynamicEnterpriseSystem } from '../data/dynamicServerEvolution';
import {
  ApplicationTopologyManager,
  SERVER_PERSONALITIES,
  assignServerPersonalities,
  IncidentInjectionAPI,
  HistoricalReplayManager,
} from '../data/nextLevelServerFeatures';

import { mockServerData } from '../data/mockserverdata';

// Enhanced System Wrapper that combines both evolution systems
class EnhancedSystemWrapper {
  constructor(mockData) {
    // Initialize the core evolution system (predictive analytics, auto-healing, contextual intelligence)
    this.evolutionSystem = createDynamicEnterpriseSystem(mockData);

    // Assign server personalities from nextLevelServerFeatures
    this.serversWithPersonalities = assignServerPersonalities(mockData.serverOverview || []);
    this.evolutionSystem.serverOverview = this.serversWithPersonalities;

    // Initialize application topology manager (from nextLevelServerFeatures)
    this.topologyManager = new ApplicationTopologyManager(
      mockData.applications || [],
      this.serversWithPersonalities
    );
    this.topologyManager.initialize();

    // Initialize advanced incident injection API (from nextLevelServerFeatures)
    this.advancedIncidentAPI = new IncidentInjectionAPI(this.evolutionSystem);

    // Initialize historical replay manager (from nextLevelServerFeatures)
    this.historyManager = new HistoricalReplayManager(1000);

    // Set up evolution callback to capture historical data
    this.setupHistoricalCapture();
  }

  setupHistoricalCapture() {
    const originalCallback = this.evolutionSystem.setEvolutionCallback;
    this.evolutionSystem.setEvolutionCallback = (userCallback) => {
      const enhancedCallback = (servers, systemHealth, applicationHealth, metadata) => {
        // Capture snapshot for historical replay
        this.historyManager.captureSnapshot(
          servers,
          metadata?.trends,
          systemHealth,
          applicationHealth
        );

        // Call user callback if provided
        if (userCallback) {
          userCallback(servers, systemHealth, applicationHealth, metadata);
        }
      };

      // Use the evolution system's original method
      if (typeof originalCallback === 'function') {
        originalCallback.call(this.evolutionSystem, enhancedCallback);
      }
    };
  }

  // ROUTING LOGIC: Intelligently routes calls to the appropriate system

  // === EVOLUTION & PREDICTIVE ANALYTICS (dynamicServerEvolution.js) ===
  startEvolution(intervalMs = 3000) {
    return this.evolutionSystem.startEvolution(intervalMs);
  }

  stopEvolution() {
    return this.evolutionSystem.stopEvolution();
  }

  setEvolutionCallback(callback) {
    return this.evolutionSystem.setEvolutionCallback(callback);
  }

  getSystemHealth() {
    return this.evolutionSystem.getSystemHealth();
  }

  getGlobalTrends() {
    return this.evolutionSystem.getGlobalTrends();
  }

  getPredictiveAnalytics() {
    return this.evolutionSystem.getPredictiveAnalytics();
  }

  getBusinessIntelligence() {
    return this.evolutionSystem.getBusinessIntelligence();
  }

  getAutoHealingStatus() {
    return this.evolutionSystem.getAutoHealingStatus();
  }

  getDatacenterAnomalies() {
    return this.evolutionSystem.getDatacenterAnomalies();
  }

  getHeatMaps() {
    return this.evolutionSystem.getHeatMaps();
  }

  getActiveIncidents() {
    return this.evolutionSystem.getActiveIncidents();
  }

  evolveOnce() {
    return this.evolutionSystem.evolveOnce();
  }

  // === APPLICATION TOPOLOGY (nextLevelServerFeatures.js) ===
  getApplicationHealth() {
    // Use the sophisticated topology manager instead of simple mock data
    const currentServers = this.evolutionSystem.serverOverview || [];
    return this.topologyManager.getAllApplicationHealth(currentServers);
  }

  getApplicationTopology() {
    return {
      applications: Array.from(this.topologyManager.applications.entries()).map(([name, app]) => ({
        name,
        ...app,
      })),
      dependencyGraph: Array.from(this.topologyManager.dependencyGraph.entries()).map(([name, deps]) => ({
        name,
        ...deps,
      })),
      serviceDiscoveryRules: this.topologyManager.serviceDiscoveryRules,
    };
  }

  updateServiceDiscovery(serviceName, matcher, fallback) {
    return this.topologyManager.updateServiceDiscoveryRule(serviceName, matcher, fallback);
  }

  addServiceDiscovery(serviceName, matcher, fallback) {
    return this.topologyManager.addServiceDiscoveryRule(serviceName, matcher, fallback);
  }

  // === INCIDENT MANAGEMENT: Combines both systems ===
  injectIncident(serverId, scenarioName, options = {}) {
    // Use the advanced incident injection API from nextLevelServerFeatures
    // This provides more sophisticated incident scenarios than the basic evolution system
    try {
      return this.advancedIncidentAPI.injectIncident(serverId, scenarioName, options);
    } catch (error) {
      // Fallback to evolution system's incident injection
      console.warn('Advanced incident injection failed, falling back to evolution system:', error.message);
      return this.evolutionSystem.injectIncident(serverId, scenarioName, options);
    }
  }

  cancelIncident(incidentId) {
    // Try advanced API first, fallback to evolution system
    try {
      return this.advancedIncidentAPI.cancelIncident(incidentId);
    } catch (error) {
      return this.evolutionSystem.cancelIncident(incidentId);
    }
  }

  getInjectedIncidents() {
    return this.advancedIncidentAPI.getInjectedIncidents();
  }

  // === SERVER PERSONALITIES (nextLevelServerFeatures.js) ===
  getServerPersonalities() {
    return {
      personalities: SERVER_PERSONALITIES,
      assignedPersonalities: this.serversWithPersonalities.map((server) => ({
        serverId: server.id,
        serverName: server.name,
        personality: server.personality,
      })),
    };
  }

  reassignServerPersonalities() {
    this.serversWithPersonalities = assignServerPersonalities(this.evolutionSystem.serverOverview || []);
    this.evolutionSystem.serverOverview = this.serversWithPersonalities;
    return this.getServerPersonalities();
  }

  // === HISTORICAL DATA (nextLevelServerFeatures.js) ===
  getHistoricalTrend(metric, timeRange) {
    return this.historyManager.getHistoricalTrend(metric, timeRange);
  }

  getEventTimeline(timeRange) {
    return this.historyManager.getEventTimeline(timeRange);
  }

  exportHistoricalData(format = 'json') {
    return this.historyManager.exportHistoricalData(format);
  }

  getHistoricalSummary() {
    return {
      totalSnapshots: this.historyManager.metricSnapshots.length,
      totalEvents: this.historyManager.evolutionHistory.length,
      oldestSnapshot: this.historyManager.metricSnapshots[0]?.timestamp,
      newestSnapshot: this.historyManager.metricSnapshots[this.historyManager.metricSnapshots.length - 1]?.timestamp,
      availableMetrics: ['cpu', 'memory', 'network', 'health', 'businessLoad'],
    };
  }

  // === LEGACY COMPATIBILITY ===
  getSlowDegradationStatus() {
    return this.evolutionSystem.getSlowDegradationStatus();
  }

  // === SYSTEM STATE ACCESS ===
  get serverOverview() {
    return this.evolutionSystem.serverOverview;
  }

  set serverOverview(servers) {
    this.evolutionSystem.serverOverview = servers;
  }

  get lastEvolutionUpdate() {
    return this.evolutionSystem.lastEvolutionUpdate;
  }

  // === ENHANCED SYSTEM INFORMATION ===
  getSystemCapabilities() {
    return {
      evolution: {
        predictiveAnalytics: true,
        autoHealing: true,
        contextualIntelligence: true,
        businessAwareness: true,
      },
      topology: {
        applicationAwareness: true,
        dependencyTracking: true,
        serviceDiscovery: true,
        dynamicNodeResolution: true,
      },
      incidents: {
        advancedScenarios: true,
        phasedExecution: true,
        businessImpactCalculation: true,
        autoHealing: true,
      },
      personalities: {
        behavioralFingerprints: true,
        typeBasedAssignment: true,
        performanceVariation: true,
      },
      historical: {
        deltaCompression: true,
        trendAnalysis: true,
        eventTimeline: true,
        dataExport: true,
      },
    };
  }

  getSystemStatus() {
    return {
      evolutionRunning: !!this.evolutionSystem.evolutionInterval,
      topologyInitialized: this.topologyManager.isInitialized,
      historicalCaptureActive: this.historyManager.metricSnapshots.length > 0,
      lastUpdate: this.lastEvolutionUpdate,
      serverCount: (this.serverOverview || []).length,
      applicationCount: this.topologyManager.applications.size,
      activeIncidentCount: this.getActiveIncidents().length,
    };
  }
}

// Create the enhanced system instance using existing mock data
const systemWrapper = new EnhancedSystemWrapper(mockServerData);

const initializeServiceDiscoveryRules = () => {
  const services = [
    'reverse-proxy', 'waf', 'web-01', 'web-02', 'customer-api',
    'session-cache', 'payment-api-01', 'payment-api-02',
    'payment-db-primary', 'payment-db-replica', 'audit-queue',
    'order-api-01', 'order-api-02', 'notification-queue',
    'analytics-app-01', 'data-warehouse-01', 'etl-worker-01',
    'etl-worker-02', 'reporting-cache', 'admin-web-01',
    'admin-api-01', 'audit-db', 'admin-cache',
  ];
  // Add default service discovery rules to prevent warnings
  services.forEach((service) => {
    try {
      systemWrapper?.addServiceDiscovery?.(
        service,
        (server) => server.name?.includes(service) || server.id?.includes(service),
        'default-fallback'
      );
    } catch (error) {
      // Silently handle errors for services that can't be initialized
      console.debug(`Could not initialize service discovery for ${service}`);
    }
  });
};

initializeServiceDiscoveryRules();

// Start evolution with intelligent features
systemWrapper.startEvolution(3000);

// Export the enhanced system wrapper
export { systemWrapper };

// Optional: Export utilities for debugging and advanced usage
export const getSystemInstance = () => systemWrapper;
export const restartEvolution = (intervalMs = 3000) => {
  systemWrapper.stopEvolution();
  systemWrapper.startEvolution(intervalMs);
};
export const getSystemCapabilities = () => systemWrapper.getSystemCapabilities();
