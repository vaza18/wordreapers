import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PeerHaveRoundsMap } from '@/lib/online/nearby/peer-have-rounds';
import { shouldAdvertiseForLobbyRoster } from '@/lib/online/nearby/should-advertise-lobby';
import { isValidPeerArchiveShape } from '@/lib/online/nearby/strip-archive';
import { shouldTrustTcpHaveAck } from '@/lib/online/nearby/tcp-have-ack-trust';
import type { FinishedRoundArchive } from '@/lib/online/session/online-session-archive';

const importedKeys: string[] = [];

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
    importFinishedRoundArchiveIfAbsent: vi.fn(async (archive: FinishedRoundArchive) => {
      const key = `${archive.gameId}:${archive.baseWordRound}`;
      if (importedKeys.includes(key)) {
        return false;
      }
      importedKeys.push(key);
      return true;
    }),
  };
});

vi.mock('@/lib/online/finalize-online-round', () => ({
  finalizeOnlineRoundForPlayer: vi.fn(async () => undefined),
}));

vi.mock('@/store/nearby-archives-store', () => ({
  useNearbyArchivesStore: {
    getState: () => ({ bumpRevision: vi.fn() }),
  },
}));

function makeArchive(overrides: Partial<FinishedRoundArchive> = {}): FinishedRoundArchive {
  return {
    gameId: 'K7X3P',
    baseWordRound: 0,
    savedAt: 1000,
    session: {
      baseWord: 'слово',
      status: 'finished',
      settings: {
        durationSeconds: 60,
        uniqueBonusEnabled: false,
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      timerEndsAt: null,
      organizerId: 'a',
      players: {
        a: { name: 'A', wordCount: 2, score: 2, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: true },
      },
      liveRoundPlayerUids: ['a', 'b'],
      baseWordRound: 0,
    },
    playerWords: { a: ['кіт', 'ліс'], b: [] },
    playerWordCounts: { a: 2, b: 0 },
    ...overrides,
  };
}

describe('nearby review critical fixes', () => {
  beforeEach(() => {
    importedKeys.length = 0;
  });

  describe('Critical #1 — v1 post-import does not finalize peer stats', () => {
    it('applyPostImportEffects only bumps revision', async () => {
      const bumpRevision = vi.fn();
      const { useNearbyArchivesStore } = await import('@/store/nearby-archives-store');
      vi.spyOn(useNearbyArchivesStore, 'getState').mockReturnValue({
        revision: 0,
        bumpRevision,
      });

      const { applyPostImportEffects } = await import('@/lib/online/nearby/post-import');
      await applyPostImportEffects({
        importedArchives: [makeArchive()],
      });
      expect(bumpRevision).toHaveBeenCalledTimes(1);
    });
  });

  describe('Critical #2 — gameId / wantRounds filter', () => {
    it('rejects foreign gameId', async () => {
      const { importPeerFinishedRoundArchive } =
        await import('@/lib/online/nearby/import-peer-archive');
      const foreign = makeArchive({ gameId: 'OTHER' });
      expect(isValidPeerArchiveShape(foreign)).toBe(true);
      const wrote = await importPeerFinishedRoundArchive(foreign, {
        expectedGameId: 'K7X3P',
        allowedRounds: [0],
      });
      expect(wrote).toBe(false);
      expect(importedKeys).toEqual([]);
    });

    it('rejects round outside wantRounds', async () => {
      const { importPeerFinishedRoundArchive } =
        await import('@/lib/online/nearby/import-peer-archive');
      const wrote = await importPeerFinishedRoundArchive(makeArchive({ baseWordRound: 2 }), {
        expectedGameId: 'K7X3P',
        allowedRounds: [0, 1],
      });
      expect(wrote).toBe(false);
    });

    it('imports matching gameId + allowed round', async () => {
      const { importPeerFinishedRoundArchive } =
        await import('@/lib/online/nearby/import-peer-archive');
      const wrote = await importPeerFinishedRoundArchive(makeArchive(), {
        expectedGameId: 'K7X3P',
        allowedRounds: [0],
      });
      expect(wrote).toBe(true);
      expect(importedKeys).toEqual(['K7X3P:0']);
    });

    it('rejects session.baseWordRound mismatch and empty baseWord (I2)', () => {
      const badRound = makeArchive({ baseWordRound: 0 });
      badRound.session = { ...badRound.session, baseWordRound: 1 };
      expect(isValidPeerArchiveShape(badRound)).toBe(false);

      const emptyWord = makeArchive();
      emptyWord.session = { ...emptyWord.session, baseWord: '   ' };
      expect(isValidPeerArchiveShape(emptyWord)).toBe(false);
    });

    it('rejects playerWords that are not string arrays', () => {
      expect(
        isValidPeerArchiveShape(
          makeArchive({
            playerWords: { a: { word: 'кіт' } as unknown as string[] },
          }),
        ),
      ).toBe(false);
    });
  });

  describe('Critical #3 — UDP HaveAck must not stop advertise', () => {
    it('spoofed untrusted HaveAck leaves lobby advertising', () => {
      const peerHave = new PeerHaveRoundsMap();
      const gameId = 'K7X3P';
      peerHave.setHaveRounds(gameId, 'b', [0, 1], 'untrusted');
      peerHave.setHaveRounds(gameId, 'c', [0, 1], 'untrusted');

      expect(peerHave.isComplete(gameId, 'b', 2)).toBe(false);
      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 2,
          selfUid: 'a',
          onlineUids: ['a', 'b', 'c'],
          localPriorArchiveCount: 2,
          peerHave,
          gameId,
        }),
      ).toBe(true);
    });

    it('trusted TCP HaveAck can stop lobby advertise', () => {
      const peerHave = new PeerHaveRoundsMap();
      const gameId = 'K7X3P';
      peerHave.setHaveRounds(gameId, 'b', [0, 1], 'trusted');
      peerHave.setHaveRounds(gameId, 'c', [0, 1], 'trusted');

      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 2,
          selfUid: 'a',
          onlineUids: ['a', 'b', 'c'],
          localPriorArchiveCount: 2,
          peerHave,
          gameId,
        }),
      ).toBe(false);
    });

    it('ignores untrusted updates after trusted snapshot', () => {
      const peerHave = new PeerHaveRoundsMap();
      peerHave.setHaveRounds('K7X3P', 'b', [0], 'trusted');
      peerHave.setHaveRounds('K7X3P', 'b', [0, 1], 'untrusted');
      expect(peerHave.isComplete('K7X3P', 'b', 1)).toBe(true);
      expect(peerHave.isComplete('K7X3P', 'b', 2)).toBe(false);
    });
  });

  describe('Critical R1 — TCP HaveAck trusted only after Want', () => {
    it('TCP HaveAck without prior Want does not stop lobby advertise', () => {
      expect(shouldTrustTcpHaveAck(null, 'b')).toBe(false);
      expect(shouldTrustTcpHaveAck(undefined, 'b')).toBe(false);
      expect(shouldTrustTcpHaveAck('b', 'c')).toBe(false);

      const peerHave = new PeerHaveRoundsMap();
      const gameId = 'K7X3P';
      // Spoofed bare TCP HaveAck must stay untrusted (or never recorded as trusted).
      peerHave.setHaveRounds(gameId, 'b', [0, 1], 'untrusted');
      peerHave.setHaveRounds(gameId, 'c', [0, 1], 'untrusted');
      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 2,
          selfUid: 'a',
          onlineUids: ['a', 'b', 'c'],
          localPriorArchiveCount: 2,
          peerHave,
          gameId,
        }),
      ).toBe(true);
    });

    it('HaveAck after Want (same uid) may be trusted and stop advertise', () => {
      expect(shouldTrustTcpHaveAck('b', 'b')).toBe(true);

      const peerHave = new PeerHaveRoundsMap();
      const gameId = 'K7X3P';
      peerHave.setHaveRounds(gameId, 'b', [0, 1], 'trusted');
      peerHave.setHaveRounds(gameId, 'c', [0, 1], 'trusted');
      expect(
        shouldAdvertiseForLobbyRoster({
          baseWordRound: 2,
          selfUid: 'a',
          onlineUids: ['a', 'b', 'c'],
          localPriorArchiveCount: 2,
          peerHave,
          gameId,
        }),
      ).toBe(false);
    });
  });
});
