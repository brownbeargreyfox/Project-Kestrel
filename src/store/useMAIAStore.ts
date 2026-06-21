// src/store/useMAIAStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useMAIAStore = create(
  persist(
    (set, get) => ({
      // --- State ---
      selectedAssets: [],
      insightMemory: [],
      activeInsight: null,
      memoryVersion: 1,
      changeHistory: [],
      recommendationLog: [],
      simulationContext: {
        assets: [],
        type: null,
        scope: null,
        impactSummary: null,
        humanRationale: '',
      },
      activePlan: null,
      debateLog: [],

      initialize: () => {
        set({
          selectedAssets: [],
          insightMemory: [],
          activeInsight: null,
          changeHistory: [],
          recommendationLog: [],
          debateLog: [],
          activePlan: null,
          simulationContext: {
            assets: [],
            type: null,
            scope: null,
            impactSummary: null,
            humanRationale: '',
          },
        });
      },

      // --- Actions ---
      addDebateEntry: (entry) =>
        set((state) => ({
          debateLog: [...state.debateLog, entry].slice(-20),
        })),

      clearDebateLog: () => set({ debateLog: [] }),

      setSelectedAssets: (assets) => set({ selectedAssets: assets }),

      pushInsight: (insight) =>
        set((state) => ({
          insightMemory: [...state.insightMemory, insight].slice(-50),
          activeInsight: insight,
        })),

      pushRecommendation: (rec) =>
        set((state) => ({
          recommendationLog: [...state.recommendationLog, rec],
        })),

      pushChange: (change) =>
        set((state) => ({
          changeHistory: [...state.changeHistory, change],
        })),

      clearMemory: () =>
        set({
          insightMemory: [],
          activeInsight: null,
          memoryVersion: get().memoryVersion + 1,
        }),

      setActivePlan: (plan) => set({ activePlan: plan }),

      updateSimulationContext: (contextPatch) =>
        set((state) => ({
          simulationContext: {
            ...state.simulationContext,
            ...contextPatch,
          },
        })),
    }),
    {
      name: 'kestrel-maia',
      // Only persist the log/memory fields — session-specific state resets on load
      partialize: (state) => ({
        recommendationLog: state.recommendationLog,
        debateLog:         state.debateLog,
        insightMemory:     state.insightMemory,
      }),
    },
  ),
);

export const ingestInsightFromMAIA = (insight) => {
  useMAIAStore.getState().pushInsight(insight);
};
