// src/core/Storage.ts - Missing StorageImpl module
import type { StorageAPI } from '../Types/plugin';

export class StorageImpl implements StorageAPI {
  private prefix: string;
  private memoryStore = new Map<string, any>(); // Fallback for non-browser environments
  
  constructor(namespace: string) {
    this.prefix = `${namespace}:`;
  }
  
  get<T = any>(key: string): T | null {
    const fullKey = this.prefix + key;
    
    try {
      if (typeof localStorage !== 'undefined') {
        const value = localStorage.getItem(fullKey);
        return value ? JSON.parse(value) : null;
      } else {
        return this.memoryStore.get(fullKey) || null;
      }
    } catch (error) {
      console.error(`Storage get error for key ${key}:`, error);
      return null;
    }
  }
  
  set(key: string, value: any): void {
    const fullKey = this.prefix + key;
    
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(fullKey, JSON.stringify(value));
      } else {
        this.memoryStore.set(fullKey, value);
      }
    } catch (error) {
      console.error(`Storage set error for key ${key}:`, error);
    }
  }
  
  remove(key: string): void {
    const fullKey = this.prefix + key;
    
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(fullKey);
      } else {
        this.memoryStore.delete(fullKey);
      }
    } catch (error) {
      console.error(`Storage remove error for key ${key}:`, error);
    }
  }
  
  clear(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        // Clear only keys with our prefix
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
      } else {
        // Clear only keys with our prefix from memory store
        Array.from(this.memoryStore.keys())
          .filter(key => key.startsWith(this.prefix))
          .forEach(key => this.memoryStore.delete(key));
      }
    } catch (error) {
      console.error('Storage clear error:', error);
    }
  }
  
  // Utility methods
  keys(): string[] {
    try {
      if (typeof localStorage !== 'undefined') {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            keys.push(key.substring(this.prefix.length));
          }
        }
        return keys;
      } else {
        return Array.from(this.memoryStore.keys())
          .filter(key => key.startsWith(this.prefix))
          .map(key => key.substring(this.prefix.length));
      }
    } catch (error) {
      console.error('Storage keys error:', error);
      return [];
    }
  }
  
  size(): number {
    return this.keys().length;
  }
}
// Export all for easy importing
//export { StorageImpl, ThemeManager, DEFAULT_THEME_TOKENS, EventBusImpl };
