import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  androidNearbyBlePermissionList,
  androidNearbyLanPermissionList,
  evaluateAndroidNearbyPermissionResults,
  nearbySyncAllowedFromCapabilities,
} from '@/lib/online/nearby/android-nearby-permissions';
import {
  ensureNearbyArchiveSyncAllowed,
  getNearbyArchiveSyncPermission,
  getNearbyBleCapabilityAllowed,
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

describe('nearby LAN vs BLE permission split (B1)', () => {
  beforeEach(async () => {
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('unknown');
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('wordreapers.nearbyArchiveSyncBleAllowed');
    await AsyncStorage.removeItem('wordreapers.nearbyArchiveSyncLanAllowed');
    resetNearbyArchiveSyncPermissionCacheForTests();
  });

  it('API 33: LAN granted + BLE denied still allows nearby sync', () => {
    const api = 33;
    const results: Record<string, string> = {};
    for (const p of androidNearbyLanPermissionList(api)) {
      results[p] = 'granted';
    }
    for (const p of androidNearbyBlePermissionList(api)) {
      results[p] = 'denied';
    }
    const caps = evaluateAndroidNearbyPermissionResults(api, results);
    expect(caps.lanAllowed).toBe(true);
    expect(caps.bleAllowed).toBe(false);
    expect(nearbySyncAllowedFromCapabilities(caps)).toBe(true);
  });

  it('API 33: LAN denied + BLE granted still allows nearby sync', () => {
    const api = 33;
    const results: Record<string, string> = {};
    for (const p of androidNearbyLanPermissionList(api)) {
      results[p] = 'denied';
    }
    for (const p of androidNearbyBlePermissionList(api)) {
      results[p] = 'granted';
    }
    const caps = evaluateAndroidNearbyPermissionResults(api, results);
    expect(caps.lanAllowed).toBe(false);
    expect(caps.bleAllowed).toBe(true);
    expect(nearbySyncAllowedFromCapabilities(caps)).toBe(true);
  });

  it('both denied → sync not allowed', () => {
    const api = 33;
    const results: Record<string, string> = {};
    for (const p of [
      ...androidNearbyLanPermissionList(api),
      ...androidNearbyBlePermissionList(api),
    ]) {
      results[p] = 'denied';
    }
    const caps = evaluateAndroidNearbyPermissionResults(api, results);
    expect(nearbySyncAllowedFromCapabilities(caps)).toBe(false);
  });

  it('ensure stores granted + bleAllowed=false when OS returns LAN-only', async () => {
    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      bleAllowed: false,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await getNearbyArchiveSyncPermission()).toBe('granted');
    expect(await getNearbyBleCapabilityAllowed()).toBe(false);
    const { getNearbyLanCapabilityAllowed } = await import('@/lib/online/nearby/permission');
    expect(await getNearbyLanCapabilityAllowed()).toBe(true);
  });

  it('ensure does not permanently deny when only BLE fails (granted still true)', async () => {
    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      bleAllowed: false,
    }));
    await ensureNearbyArchiveSyncAllowed(request);
    // Second call must not re-prompt and must still allow sync (LAN path).
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await getNearbyArchiveSyncPermission()).not.toBe('denied');
  });

  it('ensure denies forever only when neither LAN nor BLE allowed', async () => {
    const request = vi.fn(async () => ({
      granted: false,
      lanAllowed: false,
      bleAllowed: false,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(false);
    expect(await getNearbyArchiveSyncPermission()).toBe('denied');
    expect(await getNearbyBleCapabilityAllowed()).toBe(false);
  });

  it('migrates missing BLE key to unknown (probe-eligible) when sync already granted (I1)', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const { getNearbyBleCapabilityState, isNearbyBleCapabilityDeniedSync } =
      await import('@/lib/online/nearby/permission');
    await setNearbyArchiveSyncPermission('granted');
    resetNearbyArchiveSyncPermissionCacheForTests();
    // Simulate pre-split install: granted without BLE storage key.
    await AsyncStorage.removeItem('wordreapers.nearbyArchiveSyncBleAllowed');
    resetNearbyArchiveSyncPermissionCacheForTests();

    expect(await getNearbyBleCapabilityAllowed()).toBe(false);
    expect(await getNearbyBleCapabilityState()).toBe('unknown');
    expect(isNearbyBleCapabilityDeniedSync()).toBe(false);
    expect(await AsyncStorage.getItem('wordreapers.nearbyArchiveSyncBleAllowed')).toBeNull();
  });

  it('cold-start play path hydrates BLE/LAN caches without OS prompt (C1)', async () => {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const {
      hydrateNearbyCapabilitiesFromStorage,
      isNearbyBleCapabilityAllowedSync,
      isNearbyLanCapabilityAllowedSync,
      setNearbyLanCapabilityAllowed,
      setNearbyBleCapabilityAllowed,
    } = await import('@/lib/online/nearby/permission');

    await setNearbyArchiveSyncPermission('granted');
    await setNearbyBleCapabilityAllowed(true);
    await setNearbyLanCapabilityAllowed(false);
    resetNearbyArchiveSyncPermissionCacheForTests();
    // Simulate process restart: memory empty, storage still has flags.
    expect(isNearbyBleCapabilityAllowedSync()).toBe(false);
    expect(isNearbyLanCapabilityAllowedSync()).toBe(true); // null defaults LAN-on until hydrate

    await hydrateNearbyCapabilitiesFromStorage();
    expect(isNearbyBleCapabilityAllowedSync()).toBe(true);
    expect(isNearbyLanCapabilityAllowedSync()).toBe(false);
    expect(await AsyncStorage.getItem('wordreapers.nearbyArchiveSyncLanAllowed')).toBe('0');
  });

  it('iOS pending ensure leaves BLE unknown until BLE confirm (C1)', async () => {
    const {
      ensureNearbyArchiveSyncAllowed,
      isNearbyBleCapabilityAllowedSync,
      isNearbyBleCapabilityDeniedSync,
      getNearbyBleCapabilityAllowed,
      getNearbyBleCapabilityState,
      setNearbyBleCapabilityAllowed,
      getNearbyLanCapabilityAllowed,
    } = await import('@/lib/online/nearby/permission');

    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      pendingOsConfirmation: true,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await getNearbyArchiveSyncPermission()).toBe('os-pending');
    expect(await getNearbyLanCapabilityAllowed()).toBe(true);
    expect(await getNearbyBleCapabilityAllowed()).toBe(false);
    expect(await getNearbyBleCapabilityState()).toBe('unknown');
    expect(isNearbyBleCapabilityAllowedSync()).toBe(false);
    expect(isNearbyBleCapabilityDeniedSync()).toBe(false);

    // Successful BLE host/fetch confirms capability (same as ble-transport after advertise/scan).
    await setNearbyBleCapabilityAllowed(true);
    expect(isNearbyBleCapabilityAllowedSync()).toBe(true);
  });

  it('explicit BLE deny is stored as denied (I1)', async () => {
    const {
      ensureNearbyArchiveSyncAllowed,
      isNearbyBleCapabilityDeniedSync,
      getNearbyBleCapabilityState,
    } = await import('@/lib/online/nearby/permission');

    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      bleAllowed: false,
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await getNearbyBleCapabilityState()).toBe('denied');
    expect(isNearbyBleCapabilityDeniedSync()).toBe(true);
  });

  it('LAN-only OS omit leaves BLE unknown not denied (I1)', async () => {
    const {
      ensureNearbyArchiveSyncAllowed,
      getNearbyBleCapabilityState,
      isNearbyBleCapabilityDeniedSync,
    } = await import('@/lib/online/nearby/permission');

    const request = vi.fn(async () => ({
      granted: true,
      lanAllowed: true,
      // bleAllowed omitted
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(true);
    expect(await getNearbyBleCapabilityState()).toBe('unknown');
    expect(isNearbyBleCapabilityDeniedSync()).toBe(false);
  });

  it('LAN-only OS fail does not deny BLE or global nearby (C1)', async () => {
    const {
      ensureNearbyArchiveSyncAllowed,
      getNearbyArchiveSyncPermission,
      getNearbyBleCapabilityState,
      getNearbyLanCapabilityAllowed,
      isNearbyBleCapabilityDeniedSync,
    } = await import('@/lib/online/nearby/permission');

    const request = vi.fn(async () => ({
      granted: false,
      lanAllowed: false,
      // bleAllowed omitted — never evaluated
    }));
    expect(await ensureNearbyArchiveSyncAllowed(request)).toBe(false);
    expect(await getNearbyArchiveSyncPermission()).toBe('unknown');
    expect(await getNearbyLanCapabilityAllowed()).toBe(false);
    expect(await getNearbyBleCapabilityState()).toBe('unknown');
    expect(isNearbyBleCapabilityDeniedSync()).toBe(false);
  });
});
