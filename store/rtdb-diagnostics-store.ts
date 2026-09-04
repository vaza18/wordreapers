import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { WORDREAPERS_STORAGE_PREFIX } from '@/constants/storage';
import type { TrafficHistoryEntry } from '@/lib/debug/rtdb-diagnostics-types';

export interface RtdbDiagnosticsState {
  developerModeEnabled: boolean;
  rtdbDiagnosticsEnabled: boolean;
  /**
   * True once `hydrate()` has completed. Components that must not flash
   * (e.g. `RtdbTrafficBanner`) should wait for this flag before rendering
   * developer-mode UI, to avoid a brief null → visible flicker on app start
   * when diagnostics were previously enabled.
   *
   * Never persisted — cold start must stay `false` until explicit `hydrate()`.
   */
  isHydrated: boolean;
  history: TrafficHistoryEntry[];
  setDeveloperModeEnabled: (enabled: boolean) => void;
  setRtdbDiagnosticsEnabled: (enabled: boolean) => void;
  addHistoryEntry: (entry: TrafficHistoryEntry) => void;
  clearHistory: () => void;
  reset: () => void;
  hydrate: () => Promise<void>;
}

type PersistedRtdbDiagnostics = Pick<
  RtdbDiagnosticsState,
  'developerModeEnabled' | 'rtdbDiagnosticsEnabled' | 'history'
>;

export const useRtdbDiagnosticsStore = create<RtdbDiagnosticsState>()(
  persist(
    (set) => ({
      developerModeEnabled: false,
      rtdbDiagnosticsEnabled: false,
      isHydrated: false,
      history: [],

      reset: () =>
        set({
          developerModeEnabled: false,
          rtdbDiagnosticsEnabled: false,
          history: [],
          // isHydrated is NOT reset here to avoid UI flicker (e.g. RtdbTrafficBanner)
          // during manual store clears or rehydrations.
        }),

      setDeveloperModeEnabled: (enabled: boolean) =>
        set(() => {
          const next: Partial<RtdbDiagnosticsState> = { developerModeEnabled: enabled };
          if (!enabled) {
            next.rtdbDiagnosticsEnabled = false;
          }
          return next;
        }),

      setRtdbDiagnosticsEnabled: (enabled: boolean) => set({ rtdbDiagnosticsEnabled: enabled }),

      addHistoryEntry: (entry) =>
        set((state) => {
          const nextHistory = [entry, ...state.history].slice(0, 50);
          return { history: nextHistory };
        }),

      clearHistory: () => set({ history: [] }),

      hydrate: async () => {
        if (!useRtdbDiagnosticsStore.persist.hasHydrated()) {
          await useRtdbDiagnosticsStore.persist.rehydrate();
        }
        set({ isHydrated: true });
      },
    }),
    {
      name: `${WORDREAPERS_STORAGE_PREFIX}rtdbDiagnostics`,
      storage: createJSONStorage(() => AsyncStorage),
      // FIX: 2026-09 — persisted isHydrated:true skipped banner gate on cold start (ADR-025).
      partialize: (state): PersistedRtdbDiagnostics => ({
        developerModeEnabled: state.developerModeEnabled,
        rtdbDiagnosticsEnabled: state.rtdbDiagnosticsEnabled,
        history: state.history,
      }),
      merge: (persistedState, currentState) => {
        const p = (persistedState ?? {}) as Partial<PersistedRtdbDiagnostics>;
        return {
          ...currentState,
          developerModeEnabled: p.developerModeEnabled ?? currentState.developerModeEnabled,
          rtdbDiagnosticsEnabled: p.rtdbDiagnosticsEnabled ?? currentState.rtdbDiagnosticsEnabled,
          history: p.history ?? currentState.history,
          isHydrated: false,
        };
      },
    },
  ),
);
