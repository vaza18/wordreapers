import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryNearbyTransport,
  resetMemoryNearbyHostsForTests,
} from '@/lib/online/nearby/memory-transport';
import {
  maybeSyncNearbyArchives,
  reconcileNearbyArchiveHost,
  setNearbyArchiveTransportForTests,
  stopNearbyArchiveHost,
} from '@/lib/online/nearby/nearby-archive-sync';
import { peerHaveRoundsMap } from '@/lib/online/nearby/peer-have-rounds';
import { setNearbyArchiveSyncPermission } from '@/lib/online/nearby/permission';
import { resetNearbyArchiveSyncPermissionCacheForTests } from '@/lib/online/nearby/permission';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

const archiveStore: Record<string, FinishedRoundArchive> = {};

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
    listFinishedRoundArchives: vi.fn(async () => Object.values(archiveStore)),
    getFinishedRoundArchive: vi.fn(async (gameId: string, round: number) => {
      return archiveStore[`${gameId}:${round}`] ?? null;
    }),
  };
});

vi.mock('@/lib/online/nearby/import-peer-archive', () => ({
  importPeerFinishedRoundArchive: vi.fn(
    async (
      raw: FinishedRoundArchive,
      options?: { expectedGameId: string; allowedRounds: ReadonlySet<number> | readonly number[] },
    ) => {
      if (options?.expectedGameId && raw.gameId !== options.expectedGameId) {
        return false;
      }
      if (options?.allowedRounds) {
        const allowed =
          options.allowedRounds instanceof Set
            ? options.allowedRounds
            : new Set(options.allowedRounds);
        if (!allowed.has(raw.baseWordRound)) {
          return false;
        }
      }
      const key = `${raw.gameId}:${raw.baseWordRound}`;
      if (archiveStore[key]) {
        return false;
      }
      archiveStore[key] = raw;
      return true;
    },
  ),
}));

vi.mock('@/lib/online/nearby/post-import', () => ({
  applyPostImportEffects: vi.fn(async () => undefined),
}));

vi.mock('@/lib/online/nearby/request-os-permissions', () => ({
  requestNearbyOsPermissions: vi.fn(async () => ({
    granted: true,
    lanAllowed: true,
    bleAllowed: true,
  })),
}));

function makeArchive(round: number, players: string[]): FinishedRoundArchive {
  const playerMap = Object.fromEntries(
    players.map((uid) => [uid, { name: uid, wordCount: 2, score: 2, online: true }]),
  );
  return {
    gameId: 'K7X3P',
    baseWordRound: round,
    savedAt: 1000 + round,
    session: {
      baseWord: `word${round}`,
      status: 'finished',
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: null,
      organizerId: players[0] ?? 'a',
      players: playerMap,
      liveRoundPlayerUids: players,
      baseWordRound: round,
    },
    playerWords: Object.fromEntries(players.map((uid) => [uid, ['а', 'б']])),
  };
}

describe('nearby archive sync coordinator (memory transport)', () => {
  beforeEach(async () => {
    resetMemoryNearbyHostsForTests();
    peerHaveRoundsMap.clearAll();
    for (const key of Object.keys(archiveStore)) {
      delete archiveStore[key];
    }
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('wordreapers.nearbyArchiveSyncBleAllowed');
    await AsyncStorage.removeItem('wordreapers.nearbyArchiveSyncLanAllowed');
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    setNearbyArchiveTransportForTests(createMemoryNearbyTransport());
    await stopNearbyArchiveHost();
  });

  it('imports missing rounds from a hosting peer', async () => {
    const hostTransport = createMemoryNearbyTransport();
    setNearbyArchiveTransportForTests(hostTransport);

    const hostArchives: Record<string, FinishedRoundArchive> = {
      'K7X3P:0': makeArchive(0, ['host', 'peer']),
      'K7X3P:1': makeArchive(1, ['host', 'peer']),
    };

    await hostTransport.startHost({
      gameId: 'K7X3P',
      uid: 'host',
      getHaveRounds: () => [0, 1],
      getRosterUids: () => ['host', 'joiner'],
      getArchivesForRounds: async (rounds) =>
        rounds
          .map((round) => hostArchives[`K7X3P:${round}`])
          .filter((archive): archive is FinishedRoundArchive => Boolean(archive)),
    });

    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
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
          joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
        },
        baseWordRound: 2,
      },
      invitedByUid: 'host',
    });

    expect(archiveStore['K7X3P:0']).toBeTruthy();
    expect(archiveStore['K7X3P:1']).toBeTruthy();
  });

  it('queues concurrent maybeSync same key and imports after first pass finishes', async () => {
    let releaseFetch:
      | ((result: {
          archives: FinishedRoundArchive[];
          peerHaveRounds: Map<string, number[]>;
          trustedWireCompleted: boolean;
        }) => void)
      | null = null;
    let fetchCalls = 0;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return await new Promise<{
            archives: FinishedRoundArchive[];
            peerHaveRounds: Map<string, number[]>;
            trustedWireCompleted: boolean;
          }>((resolve) => {
            releaseFetch = resolve;
          });
        }
        return {
          archives: [makeArchive(0, ['host', 'joiner']), makeArchive(1, ['host', 'joiner'])],
          peerHaveRounds: new Map([['host', [0, 1]]]),
          trustedWireCompleted: false,
        };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    const joinPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    // Play/lobby mounts while join sync is in flight — must not be a silent no-op.
    const playPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: false,
    });

    await vi.waitFor(() => {
      expect(fetchCalls).toBe(1);
      expect(releaseFetch).toBeTruthy();
    });
    releaseFetch!({ archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false });

    await Promise.all([joinPass, playPass]);
    expect(fetchCalls).toBe(2);
    expect(archiveStore['K7X3P:0']).toBeTruthy();
    expect(archiveStore['K7X3P:1']).toBeTruthy();
  });

  it('coalesce keeps allowOsPermissionPrompt when play(false) overwrites join(true) (I2)', async () => {
    const { requestNearbyOsPermissions } =
      await import('@/lib/online/nearby/request-os-permissions');
    const requestOs = vi.mocked(requestNearbyOsPermissions);
    requestOs.mockClear();
    requestOs.mockResolvedValue({ granted: true, lanAllowed: true, bleAllowed: false });

    let releaseFetch:
      | ((result: {
          archives: FinishedRoundArchive[];
          peerHaveRounds: Map<string, number[]>;
          trustedWireCompleted: boolean;
        }) => void)
      | null = null;
    let fetchCalls = 0;
    const bleBudgets: number[] = [];

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async (input: { bleTimeoutMs?: number }) => {
        fetchCalls += 1;
        bleBudgets.push(input.bleTimeoutMs ?? 0);
        if (fetchCalls === 1) {
          return await new Promise<{
            archives: FinishedRoundArchive[];
            peerHaveRounds: Map<string, number[]>;
            trustedWireCompleted: boolean;
          }>((resolve) => {
            releaseFetch = resolve;
          });
        }
        return {
          archives: [makeArchive(0, ['host', 'joiner']), makeArchive(1, ['host', 'joiner'])],
          peerHaveRounds: new Map([['host', [0, 1]]]),
          trustedWireCompleted: false,
        };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    // Occupy drain with a granted sync so the join/play pair only coalesce into the queue.
    const blocker = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    await vi.waitFor(() => {
      expect(releaseFetch).toBeTruthy();
    });

    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('unknown');
    resetNearbyArchiveSyncPermissionCacheForTests();

    const joinPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: true,
      allowBleProbe: true,
    });
    const playPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: false,
      allowBleProbe: false,
    });

    releaseFetch!({ archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false });
    await Promise.all([blocker, joinPass, playPass]);

    // Without keepPrompt, coalesced play(false) would no-op on unknown and skip OS request.
    expect(requestOs).toHaveBeenCalled();
    expect(requestOs).toHaveBeenCalledWith({ includeBle: false });
    expect(fetchCalls).toBe(2);
    // C1: join∩play coalesce must not open BLE budget while capability unconfirmed.
    expect(bleBudgets[1]).toBe(0);
  });

  it('suppresses in-flight BLE probe when play(false) arrives mid-fetch (C1)', async () => {
    // BLE stays unknown (beforeEach did not deny) so join probe can open a budget.
    let releaseFetch:
      | ((result: {
          archives: FinishedRoundArchive[];
          peerHaveRounds: Map<string, number[]>;
          trustedWireCompleted: boolean;
        }) => void)
      | null = null;
    let fetchCalls = 0;
    let lastBleTimeout = -1;
    let lastBlePhaseGate: (() => boolean) | undefined;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async (input: {
        bleTimeoutMs?: number;
        isBlePhaseStillAllowed?: () => boolean;
      }) => {
        fetchCalls += 1;
        lastBleTimeout = input.bleTimeoutMs ?? 0;
        lastBlePhaseGate = input.isBlePhaseStillAllowed;
        if (fetchCalls === 1) {
          return await new Promise<{
            archives: FinishedRoundArchive[];
            peerHaveRounds: Map<string, number[]>;
            trustedWireCompleted: boolean;
          }>((resolve) => {
            releaseFetch = resolve;
          });
        }
        return { archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    const joinPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: true,
      allowBleProbe: true,
    });
    await vi.waitFor(() => {
      expect(fetchCalls).toBe(1);
      expect(releaseFetch).toBeTruthy();
    });
    expect(lastBleTimeout).toBeGreaterThan(0);
    expect(lastBlePhaseGate?.()).toBe(true);

    const playPass = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: false,
      allowBleProbe: false,
    });
    expect(lastBlePhaseGate?.()).toBe(false);

    releaseFetch!({ archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false });
    await Promise.all([joinPass, playPass]);
  });

  it('does not open BLE after explicit BT deny even with allowBleProbe (I1)', async () => {
    const { setNearbyBleCapabilityAllowed, setNearbyLanCapabilityAllowed } =
      await import('@/lib/online/nearby/permission');
    await setNearbyLanCapabilityAllowed(true);
    await setNearbyBleCapabilityAllowed(false); // explicit deny

    const bleBudgets: number[] = [];
    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async (input: { bleTimeoutMs?: number }) => {
        bleBudgets.push(input.bleTimeoutMs ?? 0);
        return { archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
      allowOsPermissionPrompt: true,
      allowBleProbe: true,
    });

    expect(bleBudgets[0]).toBe(0);
  });

  it('lobby host reconcile does not probe BLE after explicit deny (I1)', async () => {
    const { setNearbyBleCapabilityAllowed, setNearbyLanCapabilityAllowed } =
      await import('@/lib/online/nearby/permission');
    await setNearbyLanCapabilityAllowed(true);
    await setNearbyBleCapabilityAllowed(false);

    let hostAllowBleProbe: boolean | undefined;
    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async (handlers: { allowBleProbe?: boolean }) => {
        hostAllowBleProbe = handlers.allowBleProbe;
      },
      stopHost: async () => undefined,
      fetchMissing: async () => ({
        archives: [],
        peerHaveRounds: new Map(),
        trustedWireCompleted: false,
      }),
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

    // Need local prior archives so lobby wants to advertise.
    archiveStore['K7X3P:0'] = makeArchive(0, ['host', 'joiner']);
    archiveStore['K7X3P:1'] = makeArchive(1, ['host', 'joiner']);

    await reconcileNearbyArchiveHost({
      gameId: 'K7X3P',
      selfUid: 'host',
      baseWordRound: 2,
      session: {
        baseWord: 'now',
        status: 'waiting' as const,
        settings: {
          durationSeconds: 60,
          uniqueBonusEnabled: false,
          language: 'uk-uk' as const,
          allowProperNouns: false,
          allowSlang: false,
        },
        timerEndsAt: null,
        organizerId: 'host',
        players: {
          host: { name: 'H', wordCount: 0, score: 0, online: true },
          joiner: { name: 'J', wordCount: 0, score: 0, online: true },
        },
        baseWordRound: 2,
      },
      mode: 'lobby',
      isCurrent: () => true,
    });

    expect(hostAllowBleProbe).toBe(false);
  });

  it('queues cross-key maybeSync (different baseWordRound) without parallel fetch (C1)', async () => {
    let releaseFetch:
      | ((result: {
          archives: FinishedRoundArchive[];
          peerHaveRounds: Map<string, number[]>;
          trustedWireCompleted: boolean;
        }) => void)
      | null = null;
    let fetchCalls = 0;
    const fetchRounds: number[] = [];

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async (input: { wantRounds: readonly number[] }) => {
        fetchCalls += 1;
        fetchRounds.push(input.wantRounds.length);
        if (fetchCalls === 1) {
          return await new Promise<{
            archives: FinishedRoundArchive[];
            peerHaveRounds: Map<string, number[]>;
            trustedWireCompleted: boolean;
          }>((resolve) => {
            releaseFetch = resolve;
          });
        }
        return {
          archives: [
            makeArchive(0, ['host', 'joiner']),
            makeArchive(1, ['host', 'joiner']),
            makeArchive(2, ['host', 'joiner']),
          ],
          peerHaveRounds: new Map([['host', [0, 1, 2]]]),
          trustedWireCompleted: false,
        };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    const passN = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session: baseSession,
      invitedByUid: 'host',
    });
    await vi.waitFor(() => {
      expect(fetchCalls).toBe(1);
      expect(releaseFetch).toBeTruthy();
    });
    // Rematch bump while N sync still in flight — must not start a parallel fetchMissing.
    const passN1 = maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 3,
      session: { ...baseSession, baseWordRound: 3 },
      invitedByUid: 'host',
    });

    // Still only one in-flight while first hang continues.
    expect(fetchCalls).toBe(1);
    releaseFetch!({ archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false });

    await Promise.all([passN, passN1]);
    expect(fetchCalls).toBe(2);
    // Latest queued input was N=3 → Want 0..2 (length 3).
    expect(fetchRounds[1]).toBe(3);
    expect(archiveStore['K7X3P:0']).toBeTruthy();
    expect(archiveStore['K7X3P:2']).toBeTruthy();
  });

  it('does not arm completion cooldown without trustedWireCompleted (I1)', async () => {
    // Local history already complete for N=2.
    archiveStore['K7X3P:0'] = makeArchive(0, ['host', 'joiner']);
    archiveStore['K7X3P:1'] = makeArchive(1, ['host', 'joiner']);

    let fetchCalls = 0;
    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => undefined,
      stopHost: async () => undefined,
      fetchMissing: async () => {
        fetchCalls += 1;
        if (fetchCalls <= 2) {
          return {
            archives: [],
            peerHaveRounds: new Map<string, number[]>(),
            trustedWireCompleted: false,
          };
        }
        if (fetchCalls === 3) {
          // UDP Hello / discovery only — no TCP/BLE archivesEnd.
          return {
            archives: [],
            peerHaveRounds: new Map([['host', [0, 1]]]),
            trustedWireCompleted: false,
          };
        }
        if (fetchCalls === 4) {
          // Partial wire: archives bytes without archivesEnd → HaveAck (timeout/close).
          return {
            archives: [makeArchive(0, ['host', 'joiner'])],
            peerHaveRounds: new Map([['host', [0, 1]]]),
            trustedWireCompleted: false,
          };
        }
        // archivesEnd → non-empty HaveAck on TCP/BLE.
        return {
          archives: [makeArchive(0, ['host', 'joiner'])],
          peerHaveRounds: new Map([['host', [0, 1]]]),
          trustedWireCompleted: true,
        };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(1);

    // Empty discovery must NOT arm cooldown — host may appear a second later.
    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(2);

    // UDP-only contact must NOT arm cooldown — need retry for trusted HaveAck.
    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(3);

    // Partial archives without End must NOT arm cooldown.
    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(4);

    // trustedWireCompleted → arm cooldown.
    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(5);

    await maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    expect(fetchCalls).toBe(5);
  });

  it('queued maybeSync await waits until drain finishes before caller continues (C1 sync-then-host)', async () => {
    let releaseFetch:
      | ((result: {
          archives: FinishedRoundArchive[];
          peerHaveRounds: Map<string, number[]>;
          trustedWireCompleted: boolean;
        }) => void)
      | null = null;
    let fetchCalls = 0;
    let startHostCalls = 0;

    const transport = {
      kind: 'memory' as const,
      isAvailable: () => true,
      startHost: async () => {
        startHostCalls += 1;
      },
      stopHost: async () => undefined,
      fetchMissing: async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return await new Promise<{
            archives: FinishedRoundArchive[];
            peerHaveRounds: Map<string, number[]>;
            trustedWireCompleted: boolean;
          }>((resolve) => {
            releaseFetch = resolve;
          });
        }
        return { archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false };
      },
      announceHaveAck: async () => undefined,
    };
    setNearbyArchiveTransportForTests(transport);

    // Seed one prior archive so lobby shouldAdvertise is true (needs localPriorArchiveCount > 0).
    archiveStore['K7X3P:0'] = makeArchive(0, ['host', 'joiner']);

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
        joiner: { name: 'J', wordCount: 0, score: 0, online: true, invitedBy: 'host' },
      },
      baseWordRound: 2,
    };

    // Join fire-and-forget style.
    void maybeSyncNearbyArchives({
      gameId: 'K7X3P',
      selfUid: 'joiner',
      baseWordRound: 2,
      session,
      invitedByUid: 'host',
    });
    await vi.waitFor(() => {
      expect(fetchCalls).toBe(1);
      expect(releaseFetch).toBeTruthy();
    });

    let lobbySyncDone = false;
    const lobbyPath = (async () => {
      await maybeSyncNearbyArchives({
        gameId: 'K7X3P',
        selfUid: 'joiner',
        baseWordRound: 2,
        session,
        invitedByUid: 'host',
      });
      lobbySyncDone = true;
      await reconcileNearbyArchiveHost({
        gameId: 'K7X3P',
        selfUid: 'joiner',
        baseWordRound: 2,
        session,
        mode: 'lobby',
      });
    })();

    // Lobby must still be waiting — host must not start while join fetch hangs.
    await new Promise((r) => setTimeout(r, 20));
    expect(lobbySyncDone).toBe(false);
    expect(startHostCalls).toBe(0);
    expect(fetchCalls).toBe(1);

    releaseFetch!({ archives: [], peerHaveRounds: new Map(), trustedWireCompleted: false });
    await lobbyPath;
    expect(lobbySyncDone).toBe(true);
    expect(startHostCalls).toBeGreaterThanOrEqual(1);
  });
});
