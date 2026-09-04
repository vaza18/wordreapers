import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      storage.delete(key);
      return Promise.resolve();
    },
  },
}));

import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';
import { WORDREAPERS_STORAGE_PREFIX } from '@/constants/storage';

const STORAGE_KEY = `${WORDREAPERS_STORAGE_PREFIX}rtdbDiagnostics`;

describe('useRtdbDiagnosticsStore hydrate / persist', () => {
  beforeEach(async () => {
    storage.clear();
    useRtdbDiagnosticsStore.setState({
      developerModeEnabled: false,
      rtdbDiagnosticsEnabled: false,
      isHydrated: false,
      history: [],
    });
    await useRtdbDiagnosticsStore.persist.clearStorage();
  });

  it('ignores persisted isHydrated and keeps gate false until hydrate()', async () => {
    // Legacy / poisoned disk payload that incorrectly stored isHydrated:true.
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          developerModeEnabled: true,
          rtdbDiagnosticsEnabled: true,
          isHydrated: true,
          history: [
            {
              roomId: 'ABCD',
              timestamp: 1,
              downTotal: 10,
              upTotal: 5,
              wireRxTotal: 0,
              wireTxTotal: 0,
              buckets: [],
              actions: [],
            },
          ],
        },
        version: 0,
      }),
    );

    await useRtdbDiagnosticsStore.persist.rehydrate();

    const afterRehydrate = useRtdbDiagnosticsStore.getState();
    expect(afterRehydrate.developerModeEnabled).toBe(true);
    expect(afterRehydrate.rtdbDiagnosticsEnabled).toBe(true);
    expect(afterRehydrate.history).toHaveLength(1);
    expect(afterRehydrate.isHydrated).toBe(false);

    await afterRehydrate.hydrate();
    expect(useRtdbDiagnosticsStore.getState().isHydrated).toBe(true);

    // New writes must not persist isHydrated.
    useRtdbDiagnosticsStore.setState({ isHydrated: true });
    await vi.waitFor(() => {
      const raw = storage.get(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.state.isHydrated).toBeUndefined();
      expect(parsed.state.developerModeEnabled).toBe(true);
    });
  });
});
