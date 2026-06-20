// src/store/useUIStore.ts
// Zustand UI store powering the desktop/window system.

import { create } from 'zustand';
import type { ComponentType } from 'react';

export interface Toast {
  id: string;
  type: string;
  title: string;
  message: string;
  duration?: number;
}

export interface ConfirmationConfig {
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export const TOAST_TYPES = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
} as const;

let toastIdCounter = 0;
export function createToast(type: string, title: string, message: string, duration = 5000): Toast {
  return { id: `toast-${++toastIdCounter}`, type, title, message, duration };
}

export type WorkspaceId = string;

export interface OSWindow {
  id: string;
  appId?: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  isMaximized: boolean;        // per-window maximize
  opacity: number;             // 0.2 .. 1
  workspace: WorkspaceId;
  Component?: ComponentType<any>;
}

export interface UIState {
  // Desktop state
  osWindows: OSWindow[];
  osFocusedId: string | null;
  activeWorkspace: WorkspaceId;

  // Launcher state
  launcherOpen: boolean;

  // Toast notifications
  toasts: Toast[];
  addToast: (toast: Toast) => void;
  removeToast: (id: string) => void;

  // Confirmation dialog
  confirmation: ConfirmationConfig | null;
  showConfirmation: (config: ConfirmationConfig) => void;
  hideConfirmation: () => void;

  // Spawn/close/minimize
  spawnWindow: (w: Partial<OSWindow> & { id: string; title: string }) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;

  // Focus & ordering
  focusWindow: (id: string) => void;
  cycleFocus: (dir: 1 | -1) => void; // Alt+Tab

  // Geometry
  commitMove: (id: string, x: number, y: number) => void;
  commitResize: (id: string, w: number, h: number) => void;

  // Window controls
  toggleMaximize: (id: string) => void;
  setOpacity: (id: string, opacity: number) => void; // clamps to [0.2, 1]

  // Workspaces
  setWorkspace: (ws: WorkspaceId) => void;

  // Launcher actions
  openLauncher: () => void;
  closeLauncher: () => void;
  launchApp: (appId: string) => Promise<void>;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export const useUIStore = create<UIState>((set, get) => ({
  // --- Initial State ---
  osWindows: [],
  osFocusedId: null,
  activeWorkspace: 'default',
  launcherOpen: false,
  toasts: [],
  confirmation: null,

  // --- Toasts / Confirmation ---
  addToast: (toast) =>
    set((state) => {
      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        window.setTimeout(() => get().removeToast(toast.id), duration);
      }
      return { toasts: [...state.toasts, toast] };
    }),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),

  showConfirmation: (config) => set({ confirmation: config }),
  hideConfirmation: () => set({ confirmation: null }),

  // --- Spawning / Closing / Minimizing ---
  spawnWindow: (w) =>
    set((state) => {
      const nextZ = state.osWindows.reduce((m, win) => Math.max(m, win.z), 0) + 1;
      const workspace = w.workspace ?? state.activeWorkspace;
      const exists = state.osWindows.some((win) => win.id === w.id);

      if (exists) {
        // Focus existing window with same id
        return {
          osFocusedId: w.id,
          osWindows: state.osWindows.map((win) =>
            win.id === w.id ? { ...win, minimized: false, z: nextZ } : win
          ),
        };
      }

      const win: OSWindow = {
        id: w.id,
        appId: w.appId,
        title: w.title,
        x: w.x ?? 120,
        y: w.y ?? 120,
        w: clamp(w.w ?? 720, 360, 4096),
        h: clamp(w.h ?? 480, 240, 4096),
        z: nextZ,
        minimized: false,
        isMaximized: false,
        opacity: clamp(w.opacity ?? 1, 0.2, 1),
        workspace,
        Component: w.Component,
      };

      return { osWindows: [...state.osWindows, win], osFocusedId: win.id };
    }),

  closeWindow: (id) =>
    set((state) => ({
      osWindows: state.osWindows.filter((w) => w.id !== id),
      osFocusedId: state.osFocusedId === id ? null : state.osFocusedId,
    })),

  minimizeWindow: (id) =>
    set((state) => ({
      osWindows: state.osWindows.map((w) =>
        w.id === id ? { ...w, minimized: true } : w
      ),
      osFocusedId: state.osFocusedId === id ? null : state.osFocusedId,
    })),

  // --- Focus & Ordering ---
  focusWindow: (id) =>
    set((state) => {
      const maxZ = state.osWindows.reduce((m, w) => Math.max(m, w.z), 0);
      return {
        osFocusedId: id,
        osWindows: state.osWindows.map((w) =>
          w.id === id ? { ...w, minimized: false, z: maxZ + 1 } : w
        ),
      };
    }),

  cycleFocus: (dir) => {
    const { osWindows, osFocusedId, activeWorkspace } = get();
    const ordered = osWindows
      .filter((w) => !w.minimized && w.workspace === activeWorkspace)
      .sort((a, b) => a.z - b.z);
    if (ordered.length < 2) return;

    const idx = Math.max(0, ordered.findIndex((w) => w.id === osFocusedId));
    const next =
      ordered[(idx + (dir === 1 ? 1 : ordered.length - 1)) % ordered.length];
    if (next) get().focusWindow(next.id);
  },

  // --- Geometry ---
  commitMove: (id, x, y) =>
    set((state) => ({
      osWindows: state.osWindows.map((w) =>
        w.id === id ? { ...w, x, y } : w
      ),
    })),

  commitResize: (id, w, h) =>
    set((state) => ({
      osWindows: state.osWindows.map((win) =>
        win.id === id
          ? { ...win, w: clamp(w, 360, 4096), h: clamp(h, 240, 4096) }
          : win
      ),
    })),

  // --- Window Controls ---
  toggleMaximize: (id) =>
    set((state) => ({
      osWindows: state.osWindows.map((w) =>
        w.id === id ? { ...w, isMaximized: !w.isMaximized } : w
      ),
    })),

  setOpacity: (id, opacity) =>
    set((state) => ({
      osWindows: state.osWindows.map((w) =>
        w.id === id ? { ...w, opacity: clamp(opacity, 0.2, 1) } : w
      ),
    })),

  // --- Workspaces ---
  setWorkspace: (ws) => set({ activeWorkspace: ws }),

  // --- Launcher ---
  openLauncher: () => set({ launcherOpen: true }),
  closeLauncher: () => set({ launcherOpen: false }),

  launchApp: async (appId) => {
    const S = get();

    // Close the launcher overlay first
    set({ launcherOpen: false });

    // ---- Single-instance behavior (default) ----
    // If a window for this app already exists anywhere, focus it instead of spawning another.
    const existing = S.osWindows.find(w => w.appId === appId);
    if (existing) {
      if (S.activeWorkspace !== existing.workspace) {
        set({ activeWorkspace: existing.workspace });
      }
      get().focusWindow(existing.id); // also unminimizes & bumps z
      return;
    }

    try {
      // Load from the registry
      const mod = await import('/src/components/os/apps/AppRegistry');
      type RegistryEntry = {
        title: string;
        component?: any;
        loader?: () => Promise<any>;
        import?: () => Promise<any>;
        w?: number; h?: number;
        // optional override to allow duplicates
        multiInstance?: boolean;
      };
      const AppRegistry = (mod as any).AppRegistry as Record<string, RegistryEntry>;
      const app = AppRegistry?.[appId];

      if (!app) {
        console.warn(`[launchApp] No app registered for id "${appId}"`);
        return;
      }

      // Resolve component via any of the supported fields
      let Component = app.component;
      if (!Component && app.loader) {
        const loaded = await app.loader();
        Component = loaded?.default ?? loaded;
      }
      if (!Component && app.import) {
        const m = await app.import();
        Component = m?.default ?? m;
      }
      if (!Component) {
        console.warn(`[launchApp] App "${appId}" has no component/loader/import`);
        return;
      }

      // If an app explicitly opts into multi-instance, we allow duplicates
      const allowMulti = !!app.multiInstance;

      // Stable id for single-instance, unique for multi-instance
      const windowId = allowMulti ? `${appId}-${Date.now()}` : `app:${appId}`;

      // (Extra guard) if single-instance id somehow exists, just focus it
      if (!allowMulti) {
        const already = get().osWindows.find(w => w.id === windowId);
        if (already) {
          if (S.activeWorkspace !== already.workspace) set({ activeWorkspace: already.workspace });
          get().focusWindow(already.id);
          return;
        }
      }

      const { title, w = 800, h = 600 } = app;
      get().spawnWindow({
        id: windowId,
        appId,
        title,
        x: 72,
        y: 72,
        w,
        h,
        workspace: get().activeWorkspace,
        Component,
      });
    } catch (e) {
      console.error('[launchApp] failed', e);
    }
  },

}));

// Convenience selectors (optional)
export const selectWindowsInActiveWorkspace = (s: UIState) =>
  s.osWindows.filter((w) => w.workspace === s.activeWorkspace);
export const selectFocusedWindow = (s: UIState) =>
  s.osWindows.find((w) => w.id === s.osFocusedId) || null;
