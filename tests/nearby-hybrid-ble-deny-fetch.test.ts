import { beforeEach, describe, expect, it, vi } from 'vitest';

const lanFetch = vi.fn();
const bleFetch = vi.fn();

vi.mock('@/lib/online/nearby/lan-transport', () => ({
  createLanNearbyTransport: () => ({
    kind: 'lan',
    isAvailable: () => true,
    startHost: async () => undefined,
    stopHost: async () => undefined,
    fetchMissing: lanFetch,
    announceHaveAck: async () => undefined,
  }),
}));

vi.mock('@/lib/online/nearby/ble-transport', () => ({
  createBleNearbyTransport: () => ({
    kind: 'ble',
    isAvailable: () => true,
    startHost: async () => undefined,
    stopHost: async () => undefined,
    fetchMissing: bleFetch,
    announceHaveAck: async () => undefined,
  }),
}));

describe('hybrid fetchMissing BLE capability gate (I2)', () => {
  beforeEach(async () => {
    lanFetch.mockReset();
    bleFetch.mockReset();
    lanFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });
    bleFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });
    const {
      resetNearbyArchiveSyncPermissionCacheForTests,
      setNearbyBleCapabilityAllowed,
      setNearbyLanCapabilityAllowed,
    } = await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyLanCapabilityAllowed(true);
    await setNearbyBleCapabilityAllowed(false); // explicit deny
  });

  it('does not call ble.fetchMissing when denied even if bleTimeoutMs > 0', async () => {
    const { createHybridNearbyTransport } = await import('@/lib/online/nearby/hybrid-transport');
    const hybrid = createHybridNearbyTransport();
    await hybrid.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0, 1],
      byteGapRounds: [0, 1],
      timeoutMs: 30_000,
      lanTimeoutMs: 10_000,
      bleTimeoutMs: 20_000,
      isBlePhaseStillAllowed: () => true,
    });

    expect(lanFetch).toHaveBeenCalled();
    expect(bleFetch).not.toHaveBeenCalled();
  });
});
