import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeActiveRoundCache = vi.fn();
const getActiveRoundCache = vi.fn();
const saveActiveRoundCache = vi.fn();
const purgeExpiredActiveRoundCaches = vi.fn();

vi.mock('../lib/online/playable-lexicon-archive.js', () => ({
  playableLexiconSnapshotForSession: () => ({
    maxCount: 2,
    words: ['порт', 'рот'],
    displays: ['ПОРТ', 'РОТ'],
  }),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 1_500_000,
}));

vi.mock('../lib/online/session/active-round-cache.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/online/session/active-round-cache.js')>();
  return {
    ...actual,
    getActiveRoundCache: (...args: unknown[]) => getActiveRoundCache(...args),
    removeActiveRoundCache: (...args: unknown[]) => removeActiveRoundCache(...args),
    saveActiveRoundCache: (...args: unknown[]) => saveActiveRoundCache(...args),
    purgeExpiredActiveRoundCaches: (...args: unknown[]) => purgeExpiredActiveRoundCaches(...args),
  };
});

import {
  cacheActiveRoundProgress,
  clearExpiredActiveRoundCache,
  loadActiveRoundLexiconSnapshot,
  purgeStaleActiveRoundCaches,
} from '../lib/online/session/cache-active-round.js';
import { playingSession } from './helpers/game-session-fixtures.js';

describe('cache-active-round', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveActiveRoundCache.mockResolvedValue(undefined);
    removeActiveRoundCache.mockResolvedValue(undefined);
    purgeExpiredActiveRoundCaches.mockResolvedValue(undefined);
    getActiveRoundCache.mockResolvedValue(null);
  });

  it('saves session snapshot with wordPlayers and lexicon', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 1, score: 1, online: true } },
      {
        timerEndsAt: 2_000_000,
        roundStartedAt: 1_000_000,
        wordPlayers: { порт: { org: true } },
      },
    );

    await cacheActiveRoundProgress('ABCDE', 'org', session);

    expect(saveActiveRoundCache).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'ABCDE',
        sessionSnapshot: expect.objectContaining({
          wordPlayers: { порт: { org: true } },
        }),
        playableLexicon: {
          maxCount: 2,
          words: ['порт', 'рот'],
          displays: ['ПОРТ', 'РОТ'],
        },
      }),
    );
  });

  it('merges own words into wordPlayers when maps lag behind local submits', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 1, score: 1, online: true } },
      {
        timerEndsAt: 2_000_000,
        roundStartedAt: 1_000_000,
        wordPlayers: { порт: { org: true, a: true } },
      },
    );

    await cacheActiveRoundProgress('ABCDE', 'org', session, new Set(['порт', 'рот']));

    expect(saveActiveRoundCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionSnapshot: expect.objectContaining({
          wordPlayers: {
            порт: { org: true, a: true },
            рот: { org: true },
          },
        }),
      }),
    );
  });

  it('unions prior cached wordPlayers so a poorer exit cannot wipe the snapshot', async () => {
    getActiveRoundCache.mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      sessionSnapshot: {
        baseWord: 'тест',
        settings: playingSession({}).settings,
        players: { org: { name: 'Org', wordCount: 1, score: 1, online: true } },
        timerEndsAt: 2_000_000,
        organizerId: 'org',
        baseWordRound: 0,
        wordPlayers: { порт: { org: true }, рот: { a: true } },
      },
    });
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 2_000_000, roundStartedAt: 1_000_000 },
    );

    await cacheActiveRoundProgress('ABCDE', 'org', session, []);

    expect(saveActiveRoundCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionSnapshot: expect.objectContaining({
          wordPlayers: { порт: { org: true }, рот: { a: true } },
        }),
      }),
    );
  });

  it('saves snapshot without roundStartedAt when timerEndsAt is set', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 2_000_000, wordPlayers: { порт: { org: true } } },
    );

    await cacheActiveRoundProgress('ABCDE', 'org', session, ['порт']);

    expect(saveActiveRoundCache).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionSnapshot: expect.objectContaining({
          timerEndsAt: 2_000_000,
          wordPlayers: { порт: { org: true } },
        }),
      }),
    );
  });

  it('loads persisted lexicon snapshot for the active round', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 2_000_000, baseWordRound: 0 },
    );
    getActiveRoundCache.mockResolvedValue({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      playableLexicon: {
        maxCount: 2,
        words: ['порт', 'рот'],
        displays: ['ПОРТ', 'РОТ'],
      },
    });

    const snapshot = await loadActiveRoundLexiconSnapshot('ABCDE', session);

    expect(snapshot).toEqual({
      maxCount: 2,
      words: ['порт', 'рот'],
      displays: ['ПОРТ', 'РОТ'],
    });
  });

  it('skips cache save when the round is not playing', async () => {
    const session = playingSession({ org: { name: 'Org', wordCount: 0, score: 0 } });
    session.status = 'waiting';

    await cacheActiveRoundProgress('ABCDE', 'org', session);

    expect(saveActiveRoundCache).not.toHaveBeenCalled();
  });

  it('clears cache when timer ends', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 1_400_000, baseWordRound: 0 },
    );

    await clearExpiredActiveRoundCache('ABCDE', session);

    expect(removeActiveRoundCache).toHaveBeenCalledWith('ABCDE', 0);
  });

  it('keeps cache while the timer is still running', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 2_000_000, baseWordRound: 0 },
    );

    await clearExpiredActiveRoundCache('ABCDE', session);

    expect(removeActiveRoundCache).not.toHaveBeenCalled();
  });

  it('purges stale caches via server clock', async () => {
    await purgeStaleActiveRoundCaches();

    expect(purgeExpiredActiveRoundCaches).toHaveBeenCalledWith(1_500_000);
  });
});
