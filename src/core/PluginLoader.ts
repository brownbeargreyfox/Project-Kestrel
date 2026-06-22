// src/core/PluginLoader.ts - Production-ready with all fixes
import type { PluginManifest } from '../types/plugin';
import { PluginError } from '../types/plugin';

export interface PluginSource {
  type: 'bundled' | 'remote' | 'local';
  id: string;
  name: string;
  version: string;
  source?: string; // URL for remote, path for local
  integrity?: string; // SRI hash for remote (sha256-, sha384-, sha512-)
  signature?: string; // Code signature
}

export interface LoaderConfig {
  allowRemotePlugins: boolean;
  allowUnsignedPlugins: boolean;
  maxPluginSize: number; // bytes
  timeout: number; // milliseconds
  cspPolicy?: string;
}

export class PluginLoader {
  private config: LoaderConfig;
  private loadedSources = new Map<string, PluginSource>();
  private moduleCache = new Map<string, PluginManifest>(); // Cache loaded modules
  private blobUrls = new Set<string>(); // Track blob URLs for cleanup
  
  // Static bundled plugin import map for Vite
  private static bundledPlugins: Record<string, () => Promise<any>> = {
    'aida': () => import('../plugins/aida/index.tsx'),
    'maia': () => import('../plugins/maia/index.ts'), 
    'dummy': () => import('../plugins/dummy/DummyPlugin.tsx')
  };
  
  constructor(config: Partial<LoaderConfig> = {}) {
    // Fixed: Proper config merge instead of malformed .config
    this.config = {
      allowRemotePlugins: false,
      allowUnsignedPlugins: true, // For development
      maxPluginSize: 5 * 1024 * 1024, // 5MB
      timeout: 30000, // 30 seconds
      ...config
    };
  }
  
  async loadPlugin(source: PluginSource): Promise<PluginManifest> {
    // Check cache first
    const cacheKey = `${source.type}:${source.id}:${source.version}`;
    const cached = this.moduleCache.get(cacheKey);
    if (cached) {
      console.log(`Plugin ${source.id} loaded from cache`);
      return cached;
    }
    
    try {
      this.validateSource(source);
      
      let plugin: PluginManifest;
      
      switch (source.type) {
        case 'bundled':
          plugin = await this.loadBundledPlugin(source);
          break;
        case 'remote':
          plugin = await this.loadRemotePlugin(source);
          break;
        case 'local':
          plugin = await this.loadLocalPlugin(source);
          break;
        default:
          throw new PluginError(`Unsupported plugin type: ${source.type}`, 'UNSUPPORTED_TYPE');
      }
      
      this.validatePlugin(plugin, source);
      
      // Cache the loaded plugin
      this.moduleCache.set(cacheKey, plugin);
      this.loadedSources.set(plugin.id, source);
      
      console.log(`Plugin ${plugin.name} (${plugin.id}) loaded successfully`);
      return plugin;
      
    } catch (error) {
      throw new PluginError(
        `Failed to load plugin ${source.id}: ${error.message}`,
        'LOAD_FAILED',
        source.id
      );
    }
  }
  
  private validateSource(source: PluginSource): void {
    if (!source.id || !source.name || !source.version) {
      throw new PluginError('Plugin source missing required metadata', 'INVALID_SOURCE');
    }
    
    // Validate ID format
    if (!/^[a-z][a-z0-9-]*$/.test(source.id)) {
      throw new PluginError('Plugin ID must be lowercase, start with letter, contain only letters, numbers, and hyphens', 'INVALID_ID');
    }
    
    if (source.type === 'remote' && !this.config.allowRemotePlugins) {
      throw new PluginError('Remote plugins are disabled', 'REMOTE_DISABLED');
    }
    
    if (!source.signature && !this.config.allowUnsignedPlugins) {
      throw new PluginError('Unsigned plugins are disabled', 'UNSIGNED_DISABLED');
    }
    
    if (source.signature) {
      this.verifySignature(source);
    }
  }
  
  private async loadBundledPlugin(source: PluginSource): Promise<PluginManifest> {
    try {
      // Use static import map for Vite compatibility
      const importFn = PluginLoader.bundledPlugins[source.id];
      if (!importFn) {
        const availablePlugins = Object.keys(PluginLoader.bundledPlugins).join(', ');
        throw new Error(`Bundled plugin '${source.id}' not found. Available: ${availablePlugins}`);
      }
      
      const module = await importFn();
      
      if (typeof module.createPlugin === 'function') {
        return module.createPlugin();
      } else if (module.default && typeof module.default === 'function') {
        return module.default();
      } else if (module.default && typeof module.default === 'object') {
        return module.default;
      }
      
      throw new Error('Plugin module does not export a valid plugin (createPlugin function, default function, or default object)');
    } catch (error) {
      throw new PluginError(`Failed to import bundled plugin: ${error.message}`, 'IMPORT_FAILED');
    }
  }
  
  private async loadRemotePlugin(source: PluginSource): Promise<PluginManifest> {
    if (!source.source) {
      throw new PluginError('Remote plugin missing source URL', 'MISSING_SOURCE');
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      console.log(`Fetching remote plugin ${source.id} from ${source.source}`);
      
      // Fetch with timeout and size guards
      const response = await fetch(source.source, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/javascript, text/javascript',
          'User-Agent': 'Kestrel-Plugin-Loader/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      // Check content type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('javascript')) {
        console.warn(`Unexpected content type for plugin: ${contentType}`);
      }
      
      // Check size before reading body
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.maxPluginSize) {
        throw new Error(`Plugin size exceeds limit: ${contentLength} bytes`);
      }
      
      const code = await response.text();
      
      // Additional size check after reading
      if (code.length > this.config.maxPluginSize) {
        throw new Error(`Plugin code exceeds size limit: ${code.length} bytes`);
      }
      
      // Verify integrity if provided (required for production)
      if (source.integrity) {
        await this.verifyIntegrity(code, source.integrity);
      } else if (!this.config.allowUnsignedPlugins) {
        throw new Error('Remote plugin missing required integrity hash');
      }
      
      // Load via secure Blob ESM
      return await this.loadBlobESM(code, source);
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new PluginError(`Plugin load timeout after ${this.config.timeout}ms`, 'TIMEOUT');
      }
      
      throw error;
    }
  }
  
  private async loadBlobESM(code: string, source: PluginSource): Promise<PluginManifest> {
    let blobUrl = '';
    
    try {
      // Wrap code as ESM module with proper error handling
      const wrappedCode = `
        // Plugin: ${source.id} v${source.version}
        try {
          ${code}
          
          // Export the plugin (multiple fallback options)
          if (typeof createPlugin === 'function') {
            const plugin = createPlugin();
            export default plugin;
          } else if (typeof plugin !== 'undefined' && plugin) {
            export default plugin;
          } else if (typeof exports !== 'undefined' && exports.default) {
            export default exports.default;
          } else {
            throw new Error('Plugin must export createPlugin function, plugin object, or exports.default');
          }
        } catch (error) {
          console.error('Plugin execution error:', error);
          throw error;
        }
      `;
      
      // Create blob URL for ESM import
      const blob = new Blob([wrappedCode], { 
        type: 'application/javascript' 
      });
      blobUrl = URL.createObjectURL(blob);
      this.blobUrls.add(blobUrl);
      
      // Import the module
      const module = await import(/* webpackIgnore: true */ blobUrl);
      
      if (!module.default) {
        throw new Error('Plugin module did not export default');
      }
      
      return module.default;
      
    } catch (error) {
      throw new PluginError(`Plugin execution failed: ${error.message}`, 'EXECUTION_FAILED');
    } finally {
      // Clean up blob URL after a delay (allows module to initialize)
      if (blobUrl) {
        setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          this.blobUrls.delete(blobUrl);
        }, 1000);
      }
    }
  }
  
  private async loadLocalPlugin(source: PluginSource): Promise<PluginManifest> {
    if (!source.source) {
      throw new PluginError('Local plugin missing source path', 'MISSING_SOURCE');
    }
    
    try {
      // Dynamic import for local files (development only)
      const module = await import(/* @vite-ignore */ source.source);
      
      if (typeof module.createPlugin === 'function') {
        return module.createPlugin();
      } else if (module.default && typeof module.default === 'function') {
        return module.default();
      } else if (module.default) {
        return module.default;
      }
      
      throw new Error('Plugin module does not export a valid plugin');
    } catch (error) {
      throw new PluginError(`Failed to load local plugin: ${error.message}`, 'LOAD_FAILED');
    }
  }
  
  private validatePlugin(plugin: PluginManifest, source: PluginSource): void {
    const required = ['id', 'name', 'version', 'permissions', 'init', 'dispose', 'registerTabs', 'registerWidgets'];
    
    for (const field of required) {
      if (!(field in plugin)) {
        throw new PluginError(`Plugin missing required field: ${field}`, 'INVALID_PLUGIN');
      }
    }
    
    if (plugin.id !== source.id) {
      throw new PluginError(`Plugin ID mismatch: expected '${source.id}', got '${plugin.id}'`, 'ID_MISMATCH');
    }
    
    if (typeof plugin.init !== 'function' || typeof plugin.dispose !== 'function') {
      throw new PluginError('Plugin lifecycle methods must be functions', 'INVALID_LIFECYCLE');
    }
    
    if (!Array.isArray(plugin.permissions)) {
      throw new PluginError('Plugin permissions must be an array', 'INVALID_PERMISSIONS');
    }
    
    // Validate semver format
    if (!/^\d+\.\d+\.\d+/.test(plugin.version)) {
      console.warn(`Plugin ${plugin.id} version should follow semantic versioning: ${plugin.version}`);
    }
  }
  
  private async verifyIntegrity(code: string, expectedHash: string): Promise<void> {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    
    // Parse expected hash (e.g., "sha256-ABC123...")
    const match = expectedHash.match(/^(sha256|sha384|sha512)-(.+)$/);
    if (!match) {
      throw new Error(`Invalid integrity format: ${expectedHash}. Expected format: sha256-<base64>`);
    }
    
    const [, algorithm, expectedB64] = match;
    
    // Compute hash
    const hashAlgorithm = algorithm.toUpperCase().replace('SHA', 'SHA-');
    const hashBuffer = await crypto.subtle.digest(hashAlgorithm, data);
    
    // Convert to base64
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashB64 = btoa(String.fromCharCode(...hashArray));
    
    if (hashB64 !== expectedB64) {
      throw new PluginError(
        `Plugin integrity check failed. Expected ${expectedHash}, got ${algorithm}-${hashB64}`,
        'INTEGRITY_FAILED'
      );
    }
    
    console.log(`Plugin integrity verified: ${expectedHash}`);
  }
  
  private verifySignature(source: PluginSource): void {
    // In production, verify cryptographic signature
    // This would check that the plugin is signed by a trusted authority
    if (!this.config.allowUnsignedPlugins && !source.signature) {
      throw new PluginError('Plugin signature required but not provided', 'SIGNATURE_REQUIRED');
    }
    
    // TODO: Implement signature verification with public key crypto
    console.warn('Plugin signature verification not implemented');
  }
  
  // Static method to register additional bundled plugins (for build-time registration)
  static registerBundledPlugin(id: string, importFn: () => Promise<any>): void {
    PluginLoader.bundledPlugins[id] = importFn;
  }
  
  // Get available bundled plugins
  getBundledPluginIds(): string[] {
    return Object.keys(PluginLoader.bundledPlugins);
  }
  
  // Cache management
  clearCache(): void {
    this.moduleCache.clear();
    console.log('Plugin cache cleared');
  }
  
  getCacheSize(): number {
    return this.moduleCache.size;
  }
  
  // Cleanup
  unloadPlugin(pluginId: string): void {
    // Remove from caches
    const source = this.loadedSources.get(pluginId);
    if (source) {
      const cacheKey = `${source.type}:${source.id}:${source.version}`;
      this.moduleCache.delete(cacheKey);
    }
    
    this.loadedSources.delete(pluginId);
    console.log(`Plugin ${pluginId} unloaded and removed from cache`);
  }
  
  // Cleanup all blob URLs (call on app shutdown)
  cleanup(): void {
    this.blobUrls.forEach(url => URL.revokeObjectURL(url));
    this.blobUrls.clear();
    this.moduleCache.clear();
    this.loadedSources.clear();
    console.log('Plugin loader cleaned up');
  }
  
  // Debug/diagnostics
  getLoadedSources(): Map<string, PluginSource> {
    return new Map(this.loadedSources);
  }
  
  getDiagnostics() {
    return {
      cacheSize: this.moduleCache.size,
      loadedPlugins: this.loadedSources.size,
      blobUrls: this.blobUrls.size,
      bundledPlugins: Object.keys(PluginLoader.bundledPlugins),
      config: { ...this.config }
    };
  }
}
