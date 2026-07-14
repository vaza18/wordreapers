import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const setMock = vi.fn();
const removeMock = vi.fn();
const onValueMock = vi.fn();
const runTransactionMock = vi.fn();
const updateMock = vi.fn();
const incrementMock = vi.fn((n: number) => ({ __increment: n }));
const rollbackWordMapsShardMock = vi.fn();
const rollbackWordSubmitArtifactsMock = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onValue: (...args: unknown[]) => onValueMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  increment: (n: number) => incrementMock(n),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

vi.mock('../lib/online/word-maps-shard-rollback.js', () => ({
  rollbackWordMapsShard: (...args: unknown[]) => rollbackWordMapsShardMock(...args),
  rollbackWordSubmitArtifacts: (...args: unknown[]) => rollbackWordSubmitArtifactsMock(...args),
  wordPlayersShardPlayerRef: (gameId: string, normalized: string, uid: string) => ({
    path: `session_word_maps/${gameId}/wordPlayers/${normalized}/${uid}`,
  }),
  wordPlayersPerWordRef: (gameId: string, normalized: string) => ({
    path: `session_word_maps/${gameId}/wordPlayers/${normalized}`,
  }),
}));

import {
  clearAllPlayerWords,
  clearWaitingLobbyPlayerWordsAsOrganizer,
  fetchSessionPlayerWords,
  getOwnPlayerWords,
  reconcileOwnPlayerWordsWithSession,
  resetOwnPlayerWordsNode,
  restorePlayerWordsToFirebase,
  storedWordsToScoredEntries,
  submitOnlineWord,
} from '../lib/firebase/player-words-service.js';
import { DEFAULT_SESSION_SETTINGS, playingSession } from './helpers/game-session-fixtures.js';

function permissionDenied(): Error & { code: string } {
  const error = new Error('Permission denied') as Error & { code: string };
  error.code = 'PERMISSION_DENIED';
  return error;
}

function playingSessionWithUid(uid: string) {
  const now = Date.now();
  return playingSession(
    {
      [uid]: { name: 'Player', wordCount: 0, score: 0, online: true },
    },
    {
      roundStartedAt: now - 60_000,
      timerEndsAt: now + 240_000,
      wordPlayers: {},
    },
  );
}

describe('player-words-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    incrementMock.mockImplementation((n: number) => ({ __increment: n }));
    rollbackWordMapsShardMock.mockResolvedValue(undefined);
    rollbackWordSubmitArtifactsMock.mockResolvedValue(undefined);
  });

  it('fetches per-player word maps for the requested roster', async () => {
    getMock
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          порт: { display: 'порт', at: 100 },
        }),
      })
      .mockResolvedValueOnce({ exists: () => false });

    const byPlayer = await fetchSessionPlayerWords('ABCDE', ['org-1', 'guest-1']);

    expect(byPlayer.get('org-1')?.get('порт')).toEqual({ display: 'порт', at: 100 });
    expect(byPlayer.get('guest-1')?.size).toBe(0);
  });

  it('scores stored words using session word overlap maps', () => {
    const words = new Map([
      ['порт', { display: 'порт', at: 100 }],
      ['ретро', { display: 'ретро', at: 200 }],
    ]);
    const session = {
      baseWord: 'портрет',
      status: 'finished' as const,
      settings: { ...DEFAULT_SESSION_SETTINGS, uniqueBonusEnabled: true },
      timerEndsAt: null,
      organizerId: 'org',
      players: {
        org: { name: 'Org', wordCount: 2, score: 10, online: false },
      },
      wordPlayers: {
        порт: { org: true },
        ретро: { org: true, guest: true },
      },
    };

    const { entries, displays } = storedWordsToScoredEntries(words, session, true);

    expect(displays).toEqual(['порт', 'ретро']);
    expect(entries[0]?.kind).toBe('unique');
    expect(entries[1]?.kind).toBe('normal');
  });

  describe('restorePlayerWordsToFirebase', () => {
    it('skips when there are no words to restore', async () => {
      await restorePlayerWordsToFirebase('ABCDE', 'org-1', new Map());

      expect(getMock).not.toHaveBeenCalled();
      expect(setMock).not.toHaveBeenCalled();
    });

    it('skips when the session is missing or not playing', async () => {
      getMock.mockResolvedValueOnce({ exists: () => false });

      await restorePlayerWordsToFirebase(
        'ABCDE',
        'org-1',
        new Map([['порт', { display: 'порт', at: 100 }]]),
      );

      expect(setMock).not.toHaveBeenCalled();
    });

    it('writes only words that are missing on the server', async () => {
      const session = playingSessionWithUid('org-1');
      getMock
        .mockResolvedValueOnce({ exists: () => true, val: () => session })
        .mockResolvedValueOnce({
          exists: () => true,
          val: () => ({ порт: { display: 'порт', at: 50 } }),
        });

      await restorePlayerWordsToFirebase(
        'ABCDE',
        'org-1',
        new Map([
          ['порт', { display: 'порт', at: 100 }],
          ['ретро', { display: 'ретро', at: 200 }],
        ]),
      );

      expect(setMock).toHaveBeenCalledTimes(1);
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('player_words/ABCDE/org-1/ретро'),
        }),
        { display: 'ретро', at: 200 },
      );
    });
  });

  describe('reconcileOwnPlayerWordsWithSession', () => {
    it('clears stale words from a previous round when session wordCount is zero', async () => {
      const now = Date.now();
      const session = playingSession(
        { 'org-1': { name: 'Org', wordCount: 0, score: 0, online: true } },
        { roundStartedAt: now, timerEndsAt: now + 300_000 },
      );
      const words = new Map([['порт', { display: 'порт', at: now - 60_000 }]]);

      const cleared = await reconcileOwnPlayerWordsWithSession('ABCDE', 'org-1', session, words);

      expect(cleared).toBe(true);
      expect(removeMock).toHaveBeenCalled();
    });

    it('does not clear words that belong to the current round', async () => {
      const now = Date.now();
      const session = playingSession(
        { 'org-1': { name: 'Org', wordCount: 0, score: 0, online: true } },
        { roundStartedAt: now - 1000, timerEndsAt: now + 300_000 },
      );
      const words = new Map([['порт', { display: 'порт', at: now }]]);

      const cleared = await reconcileOwnPlayerWordsWithSession('ABCDE', 'org-1', session, words);

      expect(cleared).toBe(false);
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('returns false when the session is not playing', async () => {
      const session = playingSession({ 'org-1': { name: 'Org', wordCount: 0, score: 0 } });
      session.status = 'waiting';

      await expect(
        reconcileOwnPlayerWordsWithSession(
          'ABCDE',
          'org-1',
          session,
          new Map([['порт', { display: 'порт', at: 1 }]]),
        ),
      ).resolves.toBe(false);
    });
  });

  describe('resetOwnPlayerWordsNode', () => {
    it('ignores permission denied when clearing own words', async () => {
      removeMock.mockRejectedValueOnce(permissionDenied());

      await expect(resetOwnPlayerWordsNode('ABCDE', 'org-1')).resolves.toBeUndefined();
    });
  });

  describe('clearAllPlayerWords', () => {
    it('removes only the actor words when a guest clears during rematch', async () => {
      await clearAllPlayerWords('ABCDE', ['org-1', 'guest-1'], 'guest-1', 'org-1');

      expect(removeMock).toHaveBeenCalledTimes(1);
      expect(removeMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'player_words/ABCDE/guest-1' }),
      );
    });

    it('removes every player when the organizer clears the waiting lobby', async () => {
      const session = {
        status: 'waiting' as const,
        organizerId: 'org-1',
        players: {
          'org-1': { name: 'Org', wordCount: 0, score: 0 },
          'guest-1': { name: 'Guest', wordCount: 0, score: 0 },
        },
      };

      await clearWaitingLobbyPlayerWordsAsOrganizer('ABCDE', session, 'org-1');

      expect(removeMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getOwnPlayerWords', () => {
    it('parses stored word rows and skips invalid entries', async () => {
      getMock.mockResolvedValue({
        exists: () => true,
        val: () => ({
          порт: { display: 'порт', at: 100 },
          bad: { at: 1 },
        }),
      });

      const words = await getOwnPlayerWords('ABCDE', 'org-1');

      expect(words.size).toBe(1);
      expect(words.get('порт')).toEqual({ display: 'порт', at: 100 });
    });
  });

  describe('submitOnlineWord', () => {
    function mockSuccessfulSubmit(uid: string, normalized: string) {
      runTransactionMock.mockImplementation(
        async (ref: { path: string }, updater: (v: unknown) => unknown) => {
          if (ref.path.includes('/wordPlayers/') && ref.path.endsWith(`/${uid}`)) {
            return { committed: true, snapshot: { val: () => true } };
          }
          if (ref.path.includes('/players') && !ref.path.includes('/wordPlayers/')) {
            const players = updater({
              [uid]: { name: 'Player', wordCount: 0, score: 0 },
            });
            return { committed: true, snapshot: { val: () => players } };
          }
          return { committed: false, snapshot: { val: () => null } };
        },
      );

      getMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path === 'game_sessions/ABCDE') {
          return { exists: () => true, val: () => playingSessionWithUid(uid) };
        }
        if (ref.path.includes(`/wordPlayers/${normalized}`)) {
          return { exists: () => true, val: () => ({ [uid]: true }) };
        }
        return { exists: () => false };
      });
    }

    it('persists a unique word and increments session score (single path)', async () => {
      mockSuccessfulSubmit('org-1', 'порт');

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result).toEqual({
        ok: true,
        entry: expect.objectContaining({ normalized: 'порт', kind: 'unique' }),
      });
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: expect.stringContaining('player_words/ABCDE/org-1/порт') }),
        expect.objectContaining({ display: 'порт' }),
      );
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('game_sessions/ABCDE/players/org-1'),
        }),
        {
          score: { __increment: 2 },
          wordCount: { __increment: 1 },
        },
      );
      expect(runTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('session_word_maps/ABCDE/wordPlayers/порт/org-1'),
        }),
        expect.any(Function),
      );
      expect(
        runTransactionMock.mock.calls.some((call) => {
          const ref = call[0] as { path: string };
          return ref.path.includes('/players/org-1');
        }),
      ).toBe(false);
    });

    it('uses peers transaction (absolute scores) when x2 demotion applies', async () => {
      runTransactionMock.mockImplementation(
        async (ref: { path: string }, updater: (v: unknown) => unknown) => {
          if (ref.path.includes('/wordPlayers/') && ref.path.endsWith('/org-1')) {
            return { committed: true, snapshot: { val: () => true } };
          }
          if (ref.path.endsWith('/players')) {
            const next = updater({
              peer: { name: 'Peer', wordCount: 1, score: 2 },
              'org-1': { name: 'Player', wordCount: 0, score: 0 },
            });
            return { committed: true, snapshot: { val: () => next } };
          }
          return { committed: false, snapshot: { val: () => null } };
        },
      );
      getMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path.includes('/wordPlayers/порт')) {
          return { exists: () => true, val: () => ({ peer: true, 'org-1': true }) };
        }
        if (ref.path === 'game_sessions/ABCDE') {
          return {
            exists: () => true,
            val: () =>
              playingSession(
                {
                  peer: { name: 'Peer', wordCount: 1, score: 2, online: true },
                  'org-1': { name: 'Player', wordCount: 0, score: 0, online: true },
                },
                { wordPlayers: { порт: { peer: true, 'org-1': true } } },
              ),
          };
        }
        return { exists: () => false };
      });

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result.ok).toBe(true);
      expect(updateMock).not.toHaveBeenCalled();
      expect(runTransactionMock).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'game_sessions/ABCDE/players' }),
        expect.any(Function),
      );
    });

    it('returns DUPLICATE when the shard transaction does not commit', async () => {
      runTransactionMock.mockResolvedValue({ committed: false, snapshot: { val: () => true } });

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result).toEqual({ ok: false, error: 'DUPLICATE' });
      expect(rollbackWordSubmitArtifactsMock).not.toHaveBeenCalled();
    });

    it('returns NOT_PLAYING when the player is missing from wordPlayers shard', async () => {
      runTransactionMock.mockResolvedValue({ committed: true, snapshot: { val: () => true } });
      getMock.mockResolvedValue({
        exists: () => true,
        val: () => ({}),
      });

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result).toEqual({ ok: false, error: 'NOT_PLAYING' });
      expect(rollbackWordSubmitArtifactsMock).toHaveBeenCalledWith('ABCDE', 'порт', 'org-1');
    });

    it('returns SESSION_MISSING and rolls back when the session node is gone', async () => {
      runTransactionMock.mockResolvedValue({ committed: true, snapshot: { val: () => true } });
      getMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path.includes('/wordPlayers/порт')) {
          return { exists: () => true, val: () => ({ 'org-1': true }) };
        }
        return { exists: () => false };
      });

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result).toEqual({ ok: false, error: 'SESSION_MISSING' });
      expect(rollbackWordSubmitArtifactsMock).toHaveBeenCalledWith('ABCDE', 'порт', 'org-1');
    });

    it('returns NOT_PLAYING when the uid is not in session.players', async () => {
      runTransactionMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path.includes('/wordPlayers/')) {
          return { committed: true, snapshot: { val: () => true } };
        }
        return { committed: false, snapshot: { val: () => null } };
      });
      getMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path === 'game_sessions/ABCDE') {
          return {
            exists: () => true,
            val: () =>
              playingSession({
                'other-uid': { name: 'Other', wordCount: 0, score: 0, online: true },
              }),
          };
        }
        if (ref.path.includes('/wordPlayers/порт')) {
          return { exists: () => true, val: () => ({ 'org-1': true }) };
        }
        return { exists: () => false };
      });

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result).toEqual({ ok: false, error: 'NOT_PLAYING' });
      expect(rollbackWordSubmitArtifactsMock).toHaveBeenCalled();
    });

    it('rolls back shard and player_words when score write fails after wordSet', async () => {
      runTransactionMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path.includes('/wordPlayers/')) {
          return { committed: true, snapshot: { val: () => true } };
        }
        return { committed: false, snapshot: { val: () => null } };
      });
      getMock.mockImplementation(async (ref: { path: string }) => {
        if (ref.path.includes('/wordPlayers/порт')) {
          return { exists: () => true, val: () => ({ 'org-1': true }) };
        }
        if (ref.path === 'game_sessions/ABCDE') {
          return { exists: () => true, val: () => playingSessionWithUid('org-1') };
        }
        return { exists: () => false };
      });
      updateMock.mockRejectedValueOnce(new Error('score write failed'));
      setMock.mockResolvedValue(undefined);

      const result = await submitOnlineWord('ABCDE', 'org-1', 'порт', 'порт', true);

      expect(result.ok).toBe(false);
      expect(setMock).toHaveBeenCalled();
      expect(rollbackWordSubmitArtifactsMock).toHaveBeenCalledWith('ABCDE', 'порт', 'org-1');
    });
  });
});
