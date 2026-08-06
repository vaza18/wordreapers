import { beforeEach, describe, expect, it, vi } from 'vitest';

import { nearbyPlaySyncRestartKey, runNearbySyncThenHostCycle } from '@/hooks/useNearbyArchiveSync';

let releaseListArchives: (() => void) | undefined;
let listArchivesGateEnabled = false;

vi.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn(async (key: string) => store[key] ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn(async (key: string) => {
        delete store[key];
      }),
    },
  };
});

vi.mock('@/lib/online/session/online-session-archive', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/online/session/online-session-archive')
  >('@/lib/online/session/online-session-archive');
  return {
    ...actual,
    listFinishedRoundArchives: vi.fn(async () => {
      if (listArchivesGateEnabled) {
        await new Promise<void>((resolve) => {
          releaseListArchives = resolve;
        });
      }
      return [];
    }),
    getFinishedRoundArchive: vi.fn(async () => null),
  };
});

vi.mock('@/lib/online/nearby/request-os-permissions', () => ({
  requestNearbyOsPermissions: vi.fn(async () => ({
    granted: true,
    lanAllowed: true,
    bleAllowed: true,
  })),
}));

describe('nearby sync-then-host effect cycle (C1)', () => {
  beforeEach(() => {
    listArchivesGateEnabled = false;
    releaseListArchives = undefined;
  });

  it('play restart key ignores online roster fingerprint (I3)', () => {
    const base = {
      enabled: true,
      gameId: 'K7X3P',
      selfUid: 'host',
      baseWordRound: 2,
      invitedBy: '',
      inviteModalVisible: false,
    };
    expect(nearbyPlaySyncRestartKey(base)).toBe(
      nearbyPlaySyncRestartKey({ ...base /* presence flap must not change key */ }),
    );
    expect(nearbyPlaySyncRestartKey({ ...base, inviteModalVisible: true })).not.toBe(
      nearbyPlaySyncRestartKey(base),
    );
    expect(nearbyPlaySyncRestartKey({ ...base, baseWordRound: 3 })).not.toBe(
      nearbyPlaySyncRestartKey(base),
    );
  });

  it('stops host before sync and does not host after generation supersede during sync', async () => {
    const calls: string[] = [];
    let currentGen = 1;
    const sync = vi.fn(async () => {
      calls.push('sync-start');
      currentGen = 2;
      calls.push('sync-end');
    });
    const afterSync = vi.fn(async () => {
      calls.push('host');
    });
    const stopHost = vi.fn(async () => {
      calls.push('stop');
    });

    await runNearbySyncThenHostCycle({
      generation: 1,
      getCurrentGeneration: () => currentGen,
      sync,
      afterSync,
      stopHost,
    });

    expect(calls).toEqual(['stop', 'sync-start', 'sync-end']);
    expect(afterSync).not.toHaveBeenCalled();
  });

  it('overlapping cycles: superseded A does not stopHost after B already hosted', async () => {
    const stopHost = vi.fn(async () => undefined);
    let currentGen = 1;
    let releaseAAfterSync: (() => void) | undefined;
    let aSawCurrentDuringAfter = false;

    const cycleA = runNearbySyncThenHostCycle({
      generation: 1,
      getCurrentGeneration: () => currentGen,
      stopHost,
      sync: async () => undefined,
      afterSync: async (isCurrent) => {
        await new Promise<void>((resolve) => {
          releaseAAfterSync = resolve;
        });
        aSawCurrentDuringAfter = isCurrent();
        if (!isCurrent()) {
          return;
        }
        // Would have hosted — must not run when superseded.
      },
    });

    await vi.waitFor(() => {
      expect(releaseAAfterSync).toBeTypeOf('function');
    });

    currentGen = 2;
    await runNearbySyncThenHostCycle({
      generation: 2,
      getCurrentGeneration: () => currentGen,
      stopHost,
      sync: async () => undefined,
      afterSync: async (isCurrent) => {
        expect(isCurrent()).toBe(true);
      },
    });

    const stopsAfterB = stopHost.mock.calls.length;
    releaseAAfterSync?.();
    await cycleA;
    expect(aSawCurrentDuringAfter).toBe(false);
    expect(stopHost.mock.calls.length).toBe(stopsAfterB);
  });

  it('mid-reconcile supersede: startHost skipped when isCurrent flips during listArchives', async () => {
    listArchivesGateEnabled = true;
    let startHostCalls = 0;
    let stopHostCalls = 0;
    let current = true;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => {
        startHostCalls += 1;
      },
      stopHost: async () => {
        stopHostCalls += 1;
      },
      fetchMissing: async () => ({
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      }),
      announceHaveAck: async () => undefined,
    };

    const { setNearbyArchiveTransportForTests, reconcileNearbyArchiveHost, stopNearbyArchiveHost } =
      await import('@/lib/online/nearby/nearby-archive-sync');
    const { setNearbyArchiveSyncPermission, resetNearbyArchiveSyncPermissionCacheForTests } =
      await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    setNearbyArchiveTransportForTests(transport);
    await stopNearbyArchiveHost();
    stopHostCalls = 0;

    const session = {
      baseWord: 'now',
      status: 'playing' as const,
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk' as const,
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: Date.now() + 60_000,
      organizerId: 'host',
      players: {
        host: { name: 'H', wordCount: 0, score: 0, online: true },
        joiner: { name: 'J', wordCount: 0, score: 0, online: true },
      },
      baseWordRound: 2,
    };

    const reconcilePromise = reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'host',
      baseWordRound: 2,
      session,
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => current,
    });

    await vi.waitFor(() => {
      expect(releaseListArchives).toBeTypeOf('function');
    });

    // Simulate QR close: generation superseded + cleanup stopHost.
    current = false;
    await transport.stopHost();
    releaseListArchives?.();
    await reconcilePromise;

    expect(startHostCalls).toBe(0);
    expect(stopHostCalls).toBeGreaterThanOrEqual(1);
  });

  it('playQr unknown ensure is LAN-only and does not enable bleAllowed (I1)', async () => {
    const { requestNearbyOsPermissions } =
      await import('@/lib/online/nearby/request-os-permissions');
    const requestOs = vi.mocked(requestNearbyOsPermissions);
    requestOs.mockClear();
    requestOs.mockImplementation(async (opts?: { includeBle?: boolean }) => {
      if (opts?.includeBle === false) {
        return { granted: true, lanAllowed: true };
      }
      return { granted: true, lanAllowed: true, bleAllowed: true };
    });

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async () => ({
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      }),
      announceHaveAck: async () => undefined,
    };

    const { setNearbyArchiveTransportForTests, reconcileNearbyArchiveHost, stopNearbyArchiveHost } =
      await import('@/lib/online/nearby/nearby-archive-sync');
    const {
      setNearbyArchiveSyncPermission,
      resetNearbyArchiveSyncPermissionCacheForTests,
      isNearbyBleCapabilityAllowedSync,
      getNearbyBleCapabilityAllowed,
    } = await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('unknown');
    resetNearbyArchiveSyncPermissionCacheForTests();
    setNearbyArchiveTransportForTests(transport);
    await stopNearbyArchiveHost();

    await reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'host',
      baseWordRound: 2,
      session: {
        baseWord: 'now',
        status: 'playing',
        settings: {
          durationSeconds: 60,
          uniqueBonusEnabled: false,
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        timerEndsAt: Date.now() + 60_000,
        organizerId: 'host',
        players: {
          host: { name: 'H', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
        baseWordRound: 2,
      },
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => true,
    });

    expect(requestOs).toHaveBeenCalledWith({ includeBle: false });
    expect(await getNearbyBleCapabilityAllowed()).toBe(false);
    expect(isNearbyBleCapabilityAllowedSync()).toBe(false);
    const { getNearbyBleCapabilityState, isNearbyBleCapabilityDeniedSync } =
      await import('@/lib/online/nearby/permission');
    expect(await getNearbyBleCapabilityState()).toBe('unknown');
    expect(isNearbyBleCapabilityDeniedSync()).toBe(false);
  });

  it('superseded startHost does not clobber handlers after newer host claimed', async () => {
    let releaseStale: (() => void) | undefined;
    let committedLabel: string | null = null;
    let startHostEntries = 0;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async (handlers: {
        uid: string;
        applyToken?: { readonly active: boolean };
        getHaveRounds: () => number[] | Promise<number[]>;
      }) => {
        startHostEntries += 1;
        const label = (await Promise.resolve(handlers.getHaveRounds())).join(',') || handlers.uid;
        if (startHostEntries === 1) {
          await new Promise<void>((resolve) => {
            releaseStale = resolve;
          });
        }
        if (handlers.applyToken?.active === false) {
          return;
        }
        committedLabel = label;
      },
      stopHost: async () => {
        committedLabel = null;
      },
      fetchMissing: async () => ({
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      }),
      announceHaveAck: async () => undefined,
    };

    const { setNearbyArchiveTransportForTests, reconcileNearbyArchiveHost, stopNearbyArchiveHost } =
      await import('@/lib/online/nearby/nearby-archive-sync');
    const { setNearbyArchiveSyncPermission, resetNearbyArchiveSyncPermissionCacheForTests } =
      await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    setNearbyArchiveTransportForTests(transport);
    await stopNearbyArchiveHost();

    const session = {
      baseWord: 'now',
      status: 'playing' as const,
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk' as const,
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: Date.now() + 60_000,
      organizerId: 'host',
      players: {
        host: { name: 'H', wordCount: 0, score: 0, online: true },
        joiner: { name: 'J', wordCount: 0, score: 0, online: true },
      },
      baseWordRound: 2,
    };

    // Stale reconcile: forceAdvertise; getHaveRounds returns marker via empty archives → [].
    // Use distinct selfUid labels via two sessions? Same host uid — differentiate with mode
    // by patching getHaveRounds through baseWordRound in closure: stale uses round 2 → [],
    // We mark via uid field: first call uses selfUid 'stale', second 'fresh'.
    const stalePromise = reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'stale',
      baseWordRound: 2,
      session: {
        ...session,
        players: {
          stale: { name: 'S', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
      },
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => true,
    });

    await vi.waitFor(() => {
      expect(releaseStale).toBeTypeOf('function');
    });

    await stopNearbyArchiveHost();
    await reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'fresh',
      baseWordRound: 2,
      session: {
        ...session,
        players: {
          fresh: { name: 'F', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
      },
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => true,
    });
    expect(committedLabel).toBe('fresh');

    releaseStale?.();
    await stalePromise;
    expect(committedLabel).toBe('fresh');
  });

  it('stale LAN-like resume does not close Gen2 shared server resource', async () => {
    type FakeServer = { id: string; closed: boolean };
    const box: { server: FakeServer | null; committedUid: string | null; startEntries: number } = {
      server: null,
      committedUid: null,
      startEntries: 0,
    };
    let releaseListen: (() => void) | undefined;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async (handlers: { uid: string; applyToken?: { readonly active: boolean } }) => {
        box.startEntries += 1;
        const myServer: FakeServer = { id: handlers.uid, closed: false };
        if (!box.server) {
          box.server = myServer;
        }
        if (box.startEntries === 1) {
          await new Promise<void>((resolve) => {
            releaseListen = resolve;
          });
          if (handlers.applyToken?.active === false) {
            if (box.server === myServer) {
              myServer.closed = true;
              box.server = null;
            }
            return;
          }
        }
        if (handlers.applyToken?.active === false) {
          return;
        }
        box.server = myServer;
        box.committedUid = handlers.uid;
      },
      stopHost: async () => {
        if (box.server) {
          box.server.closed = true;
          box.server = null;
        }
        box.committedUid = null;
      },
      fetchMissing: async () => ({
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      }),
      announceHaveAck: async () => undefined,
    };

    const { setNearbyArchiveTransportForTests, reconcileNearbyArchiveHost, stopNearbyArchiveHost } =
      await import('@/lib/online/nearby/nearby-archive-sync');
    const { setNearbyArchiveSyncPermission, resetNearbyArchiveSyncPermissionCacheForTests } =
      await import('@/lib/online/nearby/permission');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    setNearbyArchiveTransportForTests(transport);
    await stopNearbyArchiveHost();

    const baseSession = {
      baseWord: 'now',
      status: 'playing' as const,
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk' as const,
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: Date.now() + 60_000,
      organizerId: 'host',
      players: {
        host: { name: 'H', wordCount: 0, score: 0, online: true },
        joiner: { name: 'J', wordCount: 0, score: 0, online: true },
      },
      baseWordRound: 2,
    };

    const stalePromise = reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'stale',
      baseWordRound: 2,
      session: {
        ...baseSession,
        players: {
          stale: { name: 'S', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
      },
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => true,
    });

    await vi.waitFor(() => {
      expect(releaseListen).toBeTypeOf('function');
    });

    await stopNearbyArchiveHost();
    await reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'fresh',
      baseWordRound: 2,
      session: {
        ...baseSession,
        players: {
          fresh: { name: 'F', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
      },
      mode: 'playQr',
      forceAdvertise: true,
      isCurrent: () => true,
    });
    expect(box.committedUid).toBe('fresh');
    expect(box.server?.id).toBe('fresh');
    expect(box.server?.closed).toBe(false);

    releaseListen?.();
    await stalePromise;
    expect(box.committedUid).toBe('fresh');
    expect(box.server?.id).toBe('fresh');
    expect(box.server?.closed).toBe(false);
  });
});
