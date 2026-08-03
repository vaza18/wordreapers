import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', async () => {
  const { asyncStorageMockFactory } = await import('./helpers/mock-async-storage.js');
  return asyncStorageMockFactory();
});

import { resetAsyncStorageMock } from './helpers/mock-async-storage.js';
import {
  canRestorePlayingRoundFromCache,
  clearAllActiveRoundCachesForGame,
  findActiveRoundCacheForGame,
  getActiveRoundCache,
  purgeExpiredActiveRoundCaches,
  saveActiveRoundCache,
} from '../lib/online/session/active-round-cache.js';

const snapshot = {
  baseWord: 'тест',
  baseWordRound: 0,
  settings: {
    durationSeconds: 300,
    uniqueBonusEnabled: false,
    language: 'uk' as const,
    allowProperNouns: false,
    allowSlang: false,
  },
  timerEndsAt: 2_000_000,
  roundStartedAt: 1_000_000,
  organizerId: 'org',
  players: {
    org: { name: 'Org', wordCount: 0, score: 0, online: true },
  },
};

describe('active-round-cache', () => {
  beforeEach(() => {
    resetAsyncStorageMock();
  });

  it('saves and reads a parked round entry', async () => {
    await saveActiveRoundCache({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      sessionSnapshot: snapshot,
    });

    const entry = await getActiveRoundCache('ABCDE', 0);
    expect(entry?.sessionSnapshot).toEqual(snapshot);
    expect(entry?.timerEndsAt).toBe(2_000_000);
  });

  it('finds the newest non-expired parked round for a room', async () => {
    await saveActiveRoundCache({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 1_500_000,
      sessionSnapshot: snapshot,
    });
    await saveActiveRoundCache({
      gameId: 'ABCDE',
      baseWordRound: 1,
      timerEndsAt: 2_500_000,
      sessionSnapshot: { ...snapshot, baseWordRound: 1 },
    });

    const best = await findActiveRoundCacheForGame('ABCDE', 2_000_000);
    expect(best?.baseWordRound).toBe(1);
  });

  it('clears all parked rounds for one game', async () => {
    await saveActiveRoundCache({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      sessionSnapshot: snapshot,
    });
    await saveActiveRoundCache({
      gameId: 'WXYZ',
      baseWordRound: 0,
      timerEndsAt: 2_000_000,
      sessionSnapshot: snapshot,
    });

    await clearAllActiveRoundCachesForGame('abcde');

    await expect(getActiveRoundCache('ABCDE', 0)).resolves.toBeNull();
    await expect(getActiveRoundCache('WXYZ', 0)).resolves.not.toBeNull();
  });

  it('purges expired parked rounds', async () => {
    await saveActiveRoundCache({
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: 1_000,
      sessionSnapshot: snapshot,
    });

    await purgeExpiredActiveRoundCaches(2_000);

    await expect(getActiveRoundCache('ABCDE', 0)).resolves.toBeNull();
  });

  it('requires a live session snapshot and unexpired timer for restore', () => {
    expect(
      canRestorePlayingRoundFromCache(
        {
          gameId: 'ABCDE',
          baseWordRound: 0,
          timerEndsAt: 2_000_000,
          sessionSnapshot: snapshot,
        },
        1_500_000,
      ),
    ).toBe(true);

    expect(
      canRestorePlayingRoundFromCache(
        {
          gameId: 'ABCDE',
          baseWordRound: 0,
          timerEndsAt: 1_000,
          sessionSnapshot: snapshot,
        },
        2_000,
      ),
    ).toBe(false);
  });
});
