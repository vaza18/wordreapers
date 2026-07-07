import { describe, expect, it } from 'vitest';

import type { ActiveRoundCacheEntry } from '../lib/online/session/active-round-cache.js';
import { canRestorePlayingRoundFromCache } from '../lib/online/session/active-round-cache.js';
import { parseRoundFinishedNotificationData } from '../lib/online/round-finished-notification-data.js';

describe('canRestorePlayingRoundFromCache', () => {
  it('accepts a non-expired entry with session snapshot', () => {
    const entry: ActiveRoundCacheEntry = {
      gameId: 'ABCD',
      baseWordRound: 0,
      timerEndsAt: Date.now() + 60_000,
      words: {},
      sessionSnapshot: {
        baseWord: 'тест',
        settings: {
          durationSeconds: 300,
          uniqueBonusEnabled: false,
          language: 'uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {},
        timerEndsAt: Date.now() + 60_000,
        organizerId: 'org',
        baseWordRound: 0,
      },
    };
    expect(canRestorePlayingRoundFromCache(entry, Date.now())).toBe(true);
  });

  it('rejects expired entries', () => {
    const entry: ActiveRoundCacheEntry = {
      gameId: 'ABCD',
      baseWordRound: 0,
      timerEndsAt: Date.now() - 1,
      words: {},
      sessionSnapshot: {
        baseWord: 'тест',
        settings: {
          durationSeconds: 300,
          uniqueBonusEnabled: false,
          language: 'uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {},
        timerEndsAt: Date.now() - 1,
        organizerId: 'org',
        baseWordRound: 0,
      },
    };
    expect(canRestorePlayingRoundFromCache(entry, Date.now())).toBe(false);
  });
});

describe('parseRoundFinishedNotificationData', () => {
  it('parses round finished payload', () => {
    expect(
      parseRoundFinishedNotificationData({
        type: 'round_finished',
        gameId: 'ABCD',
      }),
    ).toEqual({ type: 'round_finished', gameId: 'ABCD' });
  });

  it('ignores unknown payloads', () => {
    expect(parseRoundFinishedNotificationData({ type: 'other' })).toBeNull();
  });
});
