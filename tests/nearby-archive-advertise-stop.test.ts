import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryNearbyTransport,
  resetMemoryNearbyHostsForTests,
} from '@/lib/online/nearby/memory-transport';
import {
  maybeSyncNearbyArchives,
  setNearbyArchiveTransportForTests,
  stopNearbyArchiveHost,
} from '@/lib/online/nearby/nearby-archive-sync';
import { peerHaveRoundsMap } from '@/lib/online/nearby/peer-have-rounds';
import {
  resetNearbyArchiveSyncPermissionCacheForTests,
  setNearbyArchiveSyncPermission,
} from '@/lib/online/nearby/permission';
import { shouldAdvertiseForLobbyRoster } from '@/lib/online/nearby/should-advertise-lobby';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';
import type { GameSession } from '@/lib/firebase/types';

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
      options: { expectedGameId: string; allowedRounds: ReadonlySet<number> | readonly number[] },
    ) => {
      if (raw.gameId !== options.expectedGameId) {
        return false;
      }
      const allowed =
        options.allowedRounds instanceof Set
          ? options.allowedRounds
          : new Set(options.allowedRounds);
      if (!allowed.has(raw.baseWordRound)) {
        return false;
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

function makeArchive(gameId: string, round: number, players: string[]): FinishedRoundArchive {
  const playerMap = Object.fromEntries(
    players.map((uid) => [uid, { name: uid, wordCount: 1, score: 1, online: true }]),
  );
  return {
    gameId,
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
    playerWords: Object.fromEntries(players.map((uid) => [uid, ['а']])),
    playerWordCounts: Object.fromEntries(players.map((uid) => [uid, 1])),
  };
}

function lobbySession(players: string[]): GameSession {
  return {
    baseWord: 'live',
    status: 'waiting',
    settings: {
      durationSeconds: 60,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: players[0] ?? 'host',
    players: Object.fromEntries(
      players.map((uid) => [uid, { name: uid, wordCount: 0, score: 0, online: true }]),
    ),
    liveRoundPlayerUids: players,
    baseWordRound: 2,
  };
}

describe('nearby advertise-stop after partial gap-fill (ADR-023)', () => {
  beforeEach(async () => {
    resetMemoryNearbyHostsForTests();
    peerHaveRoundsMap.clearAll();
    for (const key of Object.keys(archiveStore)) {
      delete archiveStore[key];
    }
    setNearbyArchiveTransportForTests(createMemoryNearbyTransport());
    resetNearbyArchiveSyncPermissionCacheForTests();
    await setNearbyArchiveSyncPermission('granted');
    await stopNearbyArchiveHost();
  });

  it('N=2 joiner with round 0 already: after pulling 1, host stops lobby advertise', async () => {
    const gameId = 'K7X3P';
    const hostUid = 'host';
    const joinerUid = 'joiner';

    // Joiner local: only round 0
    archiveStore[`${gameId}:0`] = makeArchive(gameId, 0, [hostUid, joinerUid]);

    const hostPayload: Record<number, FinishedRoundArchive> = {
      0: makeArchive(gameId, 0, [hostUid, joinerUid]),
      1: makeArchive(gameId, 1, [hostUid, joinerUid]),
    };

    const transport = createMemoryNearbyTransport();
    setNearbyArchiveTransportForTests(transport);

    await transport.startHost({
      gameId,
      uid: hostUid,
      getHaveRounds: () => [0, 1],
      getRosterUids: () => [hostUid, joinerUid],
      getArchivesForRounds: async (rounds) =>
        rounds.map((round) => hostPayload[round]).filter(Boolean) as FinishedRoundArchive[],
      onHaveAck: (uid, haveRounds, source) => {
        peerHaveRoundsMap.setHaveRounds(
          gameId,
          uid,
          haveRounds,
          source === 'tcp' ? 'trusted' : 'untrusted',
        );
      },
    });

    await maybeSyncNearbyArchives({
      gameId,
      selfUid: joinerUid,
      baseWordRound: 2,
      session: lobbySession([hostUid, joinerUid]),
    });

    expect(peerHaveRoundsMap.isComplete(gameId, joinerUid, 2)).toBe(true);
    expect(
      shouldAdvertiseForLobbyRoster({
        baseWordRound: 2,
        selfUid: hostUid,
        onlineUids: [hostUid, joinerUid],
        localPriorArchiveCount: 2,
        peerHave: peerHaveRoundsMap,
        gameId,
      }),
    ).toBe(false);
  });

  it('two hosts: joiner Want/HaveAck reaches both hosts (multi-host completion)', async () => {
    const gameId = 'K7X3P';
    const hostA = 'hostA';
    const hostB = 'hostB';
    const joiner = 'joiner';

    archiveStore[`${gameId}:0`] = makeArchive(gameId, 0, [hostA, joiner]);

    const hostPayload: Record<number, FinishedRoundArchive> = {
      0: makeArchive(gameId, 0, [hostA, joiner]),
      1: makeArchive(gameId, 1, [hostA, joiner]),
    };

    const tcpAcks: Record<string, number[][]> = { [hostA]: [], [hostB]: [] };

    const transportA = createMemoryNearbyTransport();
    await transportA.startHost({
      gameId,
      uid: hostA,
      getHaveRounds: () => [0, 1],
      getRosterUids: () => [hostA, hostB, joiner],
      getArchivesForRounds: async (rounds) =>
        rounds.map((round) => hostPayload[round]).filter(Boolean) as FinishedRoundArchive[],
      onHaveAck: (uid, haveRounds, source) => {
        if (source === 'tcp' && uid === joiner) {
          tcpAcks[hostA].push([...haveRounds]);
        }
        peerHaveRoundsMap.setHaveRounds(
          gameId,
          uid,
          haveRounds,
          source === 'tcp' ? 'trusted' : 'untrusted',
        );
      },
    });

    const transportB = createMemoryNearbyTransport();
    await transportB.startHost({
      gameId,
      uid: hostB,
      getHaveRounds: () => [0, 1],
      getRosterUids: () => [hostA, hostB, joiner],
      getArchivesForRounds: async (rounds) =>
        rounds.map((round) => hostPayload[round]).filter(Boolean) as FinishedRoundArchive[],
      onHaveAck: (uid, haveRounds, source) => {
        if (source === 'tcp' && uid === joiner) {
          tcpAcks[hostB].push([...haveRounds]);
        }
        peerHaveRoundsMap.setHaveRounds(
          gameId,
          uid,
          haveRounds,
          source === 'tcp' ? 'trusted' : 'untrusted',
        );
      },
    });

    setNearbyArchiveTransportForTests(createMemoryNearbyTransport());

    await maybeSyncNearbyArchives({
      gameId,
      selfUid: joiner,
      baseWordRound: 2,
      session: lobbySession([hostA, hostB, joiner]),
    });

    expect(tcpAcks[hostA].some((rounds) => rounds.join(',') === '0,1')).toBe(true);
    expect(tcpAcks[hostB].some((rounds) => rounds.join(',') === '0,1')).toBe(true);
    expect(peerHaveRoundsMap.isComplete(gameId, joiner, 2)).toBe(true);
  });
});
