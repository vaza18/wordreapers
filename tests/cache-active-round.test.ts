import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const restorePlayerWordsToFirebase = vi.fn();
const getOwnPlayerWords = vi.fn();
const reconcileOwnPlayerWordsWithSession = vi.fn();
const getActiveRoundCache = vi.fn();
const removeActiveRoundCache = vi.fn();
const saveActiveRoundCache = vi.fn();
const purgeExpiredActiveRoundCaches = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org' }),
}));

vi.mock('../lib/firebase/player-words-service.js', () => ({
  restorePlayerWordsToFirebase: (...args: unknown[]) => restorePlayerWordsToFirebase(...args),
  reconcileOwnPlayerWordsWithSession: (...args: unknown[]) =>
    reconcileOwnPlayerWordsWithSession(...args),
  getOwnPlayerWords: (...args: unknown[]) => getOwnPlayerWords(...args),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 1_500_000,
}));

vi.mock('../lib/online/active-round-cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/online/active-round-cache.js')>();
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
  purgeStaleActiveRoundCaches,
  tryRestoreActiveRoundCache,
} from '../lib/online/cache-active-round.js';
import { playingSession } from './helpers/game-session-fixtures.js';

describe('cache-active-round', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restorePlayerWordsToFirebase.mockResolvedValue(undefined);
    reconcileOwnPlayerWordsWithSession.mockResolvedValue(false);
    getOwnPlayerWords.mockResolvedValue(new Map());
    saveActiveRoundCache.mockResolvedValue(undefined);
    removeActiveRoundCache.mockResolvedValue(undefined);
    purgeExpiredActiveRoundCaches.mockResolvedValue(undefined);
  });

  it('saves active round progress when playing with words', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 1, score: 1, online: true } },
      { timerEndsAt: 2_000_000 },
    );
    const words = new Map([['порт', { display: 'порт', at: 100 }]]);

    await cacheActiveRoundProgress('ABCD', 'org', session, words);

    expect(saveActiveRoundCache).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'ABCD',
        words: { порт: { display: 'порт', at: 100 } },
      }),
    );
  });

  it('skips cache save when the round is not playing', async () => {
    const session = playingSession({ org: { name: 'Org', wordCount: 0, score: 0 } });
    session.status = 'waiting';

    await cacheActiveRoundProgress(
      'ABCD',
      'org',
      session,
      new Map([['порт', { display: 'порт', at: 100 }]]),
    );

    expect(saveActiveRoundCache).not.toHaveBeenCalled();
  });

  it('restores cached words when remote and session counts are empty', async () => {
    const session = playingSession(
      { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
      { timerEndsAt: 2_000_000, baseWordRound: 0 },
    );
    getActiveRoundCache.mockResolvedValue({
      gameId: 'ABCD',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      words: { порт: { display: 'порт', at: 100 } },
    });
    getMock.mockResolvedValue({ exists: () => true, val: () => session });

    await tryRestoreActiveRoundCache('ABCD', 'org', session, 0);

    expect(restorePlayerWordsToFirebase).toHaveBeenCalled();
  });

  it('purges stale caches via server clock', async () => {
    await purgeStaleActiveRoundCaches();

    expect(purgeExpiredActiveRoundCaches).toHaveBeenCalledWith(1_500_000);
  });
});
