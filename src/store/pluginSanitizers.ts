// src/store/pluginSanitizers.ts
import type {
  PluginTabRuntime,
  PluginWidgetRuntime,
  PersistedTabDTO,
  PersistedWidgetDTO,
} from '../types/plugin-runtime';

export function sanitizeTabs(
  tabs: Array<PluginTabRuntime<any>>
): PersistedTabDTO[] {
  return tabs.map(({ id, label, pluginId, order, isLegacy }) => ({
    id, label, pluginId, order, isLegacy,
  }));
}

export function sanitizeWidgets(
  widgets: Array<PluginWidgetRuntime<any>>
): PersistedWidgetDTO[] {
  return widgets.map(({ id, title, pluginId, sizeHints, category, isLegacy }) => ({
    id, title, pluginId, sizeHints, category, isLegacy,
  }));
}

/** Optional belt‑and‑suspenders: strip accidental `component` keys deeply */
export function deepStripComponents<T extends Record<string, any>>(obj: T): T {
  const seen = new WeakSet();
  const strip = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return v;
      seen.add(v);
      if (Array.isArray(v)) return v.map(strip);
      const out: any = {};
      for (const k of Object.keys(v)) {
        if (k === 'component') continue;
        out[k] = strip(v[k]);
      }
      return out;
    }
    return v;
  };
  return strip(obj);
}
