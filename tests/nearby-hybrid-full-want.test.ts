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

vi.mock('@/lib/online/nearby/permission', async () => {
  const actual = await vi.importActual<typeof import('@/lib/online/nearby/permission')>(
    '@/lib/online/nearby/permission',
  );
  return {
    ...actual,
    isNearbyBleCapabilityAllowedSync: () => true,
    isNearbyLanCapabilityAllowedSync: () => true,
  };
});

describe('hybrid BLE full Want after partial LAN (C2)', () => {
  beforeEach(() => {
    lanFetch.mockReset();
    bleFetch.mockReset();
  });

  it('passes full wantRounds to BLE even when LAN returned a subset of archives', async () => {
    const { createHybridNearbyTransport } = await import('@/lib/online/nearby/hybrid-transport');
    lanFetch.mockResolvedValue({
      archives: [
        {
          gameId: 'K7X3P',
          baseWordRound: 0,
          savedAt: 1,
          session: {
            baseWord: 'w0',
            status: 'finished',
            settings: {
              durationSeconds: 60,
              uniqueBonusEnabled: false,
              language: 'uk-uk',
              allowProperNouns: false,
              allowSlang: false,
            },
            timerEndsAt: null,
            organizerId: 'h',
            players: { h: { name: 'H', wordCount: 0, score: 0, online: true } },
            liveRoundPlayerUids: ['h'],
            baseWordRound: 0,
          },
          playerWords: { h: [] },
        },
      ],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });
    bleFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });

    const hybrid = createHybridNearbyTransport();
    await hybrid.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0, 1],
      timeoutMs: 30_000,
      lanTimeoutMs: 10_000,
      bleTimeoutMs: 20_000,
    });

    expect(bleFetch).toHaveBeenCalled();
    const bleInput = bleFetch.mock.calls[0]?.[0] as { wantRounds: number[] };
    expect(bleInput.wantRounds).toEqual([0, 1]);
  });

  it('skips BLE phase when isBlePhaseStillAllowed returns false mid-fetch (C1)', async () => {
    const { createHybridNearbyTransport } = await import('@/lib/online/nearby/hybrid-transport');
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

    const hybrid = createHybridNearbyTransport();
    await hybrid.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0, 1],
      timeoutMs: 30_000,
      lanTimeoutMs: 10_000,
      bleTimeoutMs: 20_000,
      isBlePhaseStillAllowed: () => false,
    });

    expect(lanFetch).toHaveBeenCalled();
    expect(bleFetch).not.toHaveBeenCalled();
  });

  it('skips BLE after LAN trustedWireCompleted when no byte gaps (I1)', async () => {
    const { createHybridNearbyTransport } = await import('@/lib/online/nearby/hybrid-transport');
    lanFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: true,
    });
    bleFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });

    const hybrid = createHybridNearbyTransport();
    await hybrid.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0, 1],
      byteGapRounds: [],
      seekCompletionAck: true,
      timeoutMs: 30_000,
      lanTimeoutMs: 10_000,
      bleTimeoutMs: 20_000,
    });

    expect(lanFetch).toHaveBeenCalled();
    expect(bleFetch).not.toHaveBeenCalled();
  });

  it('enters BLE for completion when LAN did not trustedWireComplete (I1)', async () => {
    const { createHybridNearbyTransport } = await import('@/lib/online/nearby/hybrid-transport');
    lanFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: false,
    });
    bleFetch.mockResolvedValue({
      archives: [],
      peerHaveRounds: new Map(),
      trustedWireCompleted: true,
    });

    const hybrid = createHybridNearbyTransport();
    await hybrid.fetchMissing({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      candidateUids: ['host'],
      wantRounds: [0, 1],
      byteGapRounds: [],
      seekCompletionAck: true,
      timeoutMs: 30_000,
      lanTimeoutMs: 10_000,
      bleTimeoutMs: 20_000,
    });

    expect(bleFetch).toHaveBeenCalled();
  });
});
