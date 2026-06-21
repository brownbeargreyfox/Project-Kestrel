// src/plugins/aida/store/useAIDAStore.ts
// Canonical AIDA Zustand store — single source of truth for command center
// and radar state. All state mutations go through named actions.

import { create } from 'zustand';
import type {
  Risk,
  AIDAAsset,
  AIDAEvent,
  SimulationResult,
  AIDAConnectionState,
  AIDAFilterState,
  AIDALayoutState,
  AIDAToast,
} from '../../../Types/aida';

// ── state shape ───────────────────────────────────────────────────────────────

interface AIDAState {
  // connection
  wsConnected:     boolean;
  connectionState: AIDAConnectionState;
  serverTime:      string | null;
  lastError:       string | null;

  // data
  events:   AIDAEvent[];
  assets:   Record<string, AIDAAsset>;
  lastSim:  SimulationResult | null;
  maxEvents: number;

  // risks
  risks:            Record<string, Risk>;
  lastRiskUpdateTs: number | null;
  selectedRiskId:   string | null;
  seenRiskIds:      Record<string, true>;

  // bridge
  dataMode: 'live' | 'mock' | null;

  // notifications
  toasts: AIDAToast[];

  // ui
  filters: AIDAFilterState;
  layout:  AIDALayoutState;
}

// ── action shape ──────────────────────────────────────────────────────────────

interface AIDAActions {
  setWsConnected(ok: boolean): void;
  setConnectionState(state: AIDAConnectionState): void;
  setServerTime(value: string | null): void;
  setLastError(error: string | null): void;
  setDataMode(mode: 'live' | 'mock' | null): void;
  ingestEvent(event: AIDAEvent): void;
  updateAsset(id: string, asset: AIDAAsset): void;
  setAssets(assets: AIDAAsset[]): void;
  setLastSim(result: SimulationResult | null): void;
  upsertRisk(risk: Risk): void;
  upsertRisks(risks: Risk[]): void;
  removeRisk(riskId: string): void;
  markRisksSeen(ids: string[]): void;
  setSelectedRisk(riskId: string | null): void;
  setFilters(filters: Partial<AIDAFilterState>): void;
  setLayout(layout: Partial<AIDALayoutState>): void;
  clearSelection(): void;
  pushToast(toast: Omit<AIDAToast, 'id'>): void;
  dismissToast(id: string): void;
  getRiskArray(): Risk[];
  getRiskById(id: string): Risk | undefined;
}

type AIDAStore = AIDAState & AIDAActions;

// ── feature flags (resolved once at module load) ──────────────────────────────
// Env vars: VITE_FF_SHOW_CALIBRATION, VITE_FF_WORKFLOW_ACTIONS, VITE_FF_CANVAS_LAYER

const FF_SHOW_CALIBRATION    = import.meta.env['VITE_FF_SHOW_CALIBRATION']  === 'true';
const FF_WORKFLOW_ACTIONS    = import.meta.env['VITE_FF_WORKFLOW_ACTIONS']  === 'true';
const FF_CANVAS_LAYER        = import.meta.env['VITE_FF_CANVAS_LAYER']      === 'true';

// ── store ─────────────────────────────────────────────────────────────────────

export const useAIDAStore = create<AIDAStore>()((set, get) => ({
  // ── initial state ────────────────────────────────────────────────────────
  wsConnected:     false,
  connectionState: 'idle',
  serverTime:      null,
  lastError:       null,
  dataMode:        null,
  events:          [],
  assets:          {},
  lastSim:         null,
  maxEvents:       200,
  risks:           {},
  lastRiskUpdateTs: null,
  selectedRiskId:  null,
  seenRiskIds:     {},
  toasts:          [],
  filters: {
    severity: 'all',
    type:     'all',
    state:    'all',
    search:   '',
  },
  layout: {
    showCalibration:     FF_SHOW_CALIBRATION,
    showWorkflowActions: FF_WORKFLOW_ACTIONS,
    useCanvas:           FF_CANVAS_LAYER,
  },

  // ── connection ───────────────────────────────────────────────────────────
  setWsConnected:    (ok)    => set({ wsConnected: ok }),
  setConnectionState:(state) => set({ connectionState: state }),
  setServerTime:     (value) => set({ serverTime: value }),
  setLastError:      (error) => set({ lastError: error }),
  setDataMode:       (mode)  => set({ dataMode: mode }),

  // ── events ───────────────────────────────────────────────────────────────
  ingestEvent: (event) =>
    set((s) => ({
      events: [event, ...s.events].slice(0, s.maxEvents),
    })),

  // ── assets ───────────────────────────────────────────────────────────────
  updateAsset: (id, asset) =>
    set((s) => ({ assets: { ...s.assets, [id]: asset } })),

  setAssets: (assets) =>
    set(() => {
      const m: Record<string, AIDAAsset> = {};
      for (const a of assets) m[a.id] = a;
      return { assets: m };
    }),

  // ── simulation ───────────────────────────────────────────────────────────
  setLastSim: (result) => set({ lastSim: result }),

  // ── risks ────────────────────────────────────────────────────────────────
  upsertRisk: (risk) =>
    set((s) => ({
      risks: { ...s.risks, [risk.id]: risk },
      lastRiskUpdateTs: Date.now(),
    })),

  upsertRisks: (risks) =>
    set((s) => {
      const next: Record<string, Risk> = { ...s.risks };
      for (const r of risks) next[r.id] = r;
      return { risks: next, lastRiskUpdateTs: Date.now() };
    }),

  removeRisk: (riskId) =>
    set((s) => {
      if (!(riskId in s.risks)) return s;
      const next: Record<string, Risk> = {};
      for (const [k, v] of Object.entries(s.risks)) {
        if (k !== riskId) next[k] = v;
      }
      return { risks: next, lastRiskUpdateTs: Date.now() };
    }),

  // ── selection ────────────────────────────────────────────────────────────
  setSelectedRisk: (riskId) => set({ selectedRiskId: riskId }),
  clearSelection:  ()       => set({ selectedRiskId: null }),

  // ── seen-risk tracking ───────────────────────────────────────────────────
  markRisksSeen: (ids) =>
    set((s) => {
      const next = { ...s.seenRiskIds };
      for (const id of ids) next[id] = true;
      return { seenRiskIds: next };
    }),

  // ── toasts ───────────────────────────────────────────────────────────────
  pushToast: (toast) =>
    set((s) => ({
      toasts: [
        { ...toast, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
        ...s.toasts,
      ].slice(0, 5),
    })),

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── filters / layout ─────────────────────────────────────────────────────
  setFilters: (filters) =>
    set((s) => ({ filters: { ...s.filters, ...filters } })),

  setLayout: (layout) =>
    set((s) => ({ layout: { ...s.layout, ...layout } })),

  // ── computed getters (use getState() outside React) ───────────────────────
  getRiskArray: () => Object.values(get().risks),

  getRiskById: (id) => get().risks[id],
}));
