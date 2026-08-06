import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  ensureNearbyArchiveSyncAllowed,
  getNearbyArchiveSyncPermission,
  resetNearbyArchiveSyncPermissionCacheForTests,
  setNearbyArchiveSyncPermission,
} from '@/lib/online/nearby/permission';

vi.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => store[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete store[key];
      }),
      clear: vi.fn(async () => {
        store = {};
      }),
    },
  };
});

describe('nearby archive sync permission', () => {
  beforeEach(async () => {
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('unknown');
    resetNearbyArchiveSyncPermissionCacheForTests();
  });

  it('requests OS only when unknown and stores denied forever', async () => {
    const request = vi.fn(async () => ({
      granted: false,
      lanAllowed: false,
      bleAllowed: false,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await getNearbyArchiveSyncPermission()).toBe('denied');

    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requests once then remembers granted', async () => {
    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      bleAllowed: true,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('iOS-style pendingOsConfirmation stays os-pending until mark success', async () => {
    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      bleAllowed: false,
      pendingOsConfirmation: true,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await getNearbyArchiveSyncPermission()).toBe('os-pending');
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    const { markNearbyArchiveSyncGrantedAfterSuccess } =
      await import('@/lib/online/nearby/permission');
    await markNearbyArchiveSyncGrantedAfterSuccess();
    expect(await getNearbyArchiveSyncPermission()).toBe('granted');
  });
});
