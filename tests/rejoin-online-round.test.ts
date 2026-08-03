import { describe, expect, it } from 'vitest';

import type { ActiveRoundCacheEntry } from '../lib/online/session/active-round-cache.js';
import { canRestorePlayingRoundFromCache } from '../lib/online/session/active-round-cache.js';
import { parseRoundFinishedNotificationData } from '../lib/online/round-finished-notification-data.js';

describe('canRestorePlayingRoundFromCache', () => {
  it('accepts a non-expired entry with session snapshot', () => {
    const entry: ActiveRoundCacheEntry = {
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: Date.now() + 60_000,
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
      gameId: 'ABCDE',
      baseWordRound: 0,
      timerEndsAt: Date.now() - 1,
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
  it('parses round finished payload with baseWordRound', () => {
    expect(
      parseRoundFinishedNotificationData({
        type: 'round_finished',
        gameId: 'ABCDE',
        baseWordRound: 2,
      }),
    ).toEqual({ type: 'round_finished', gameId: 'ABCDE', baseWordRound: 2 });
  });

  it('accepts stringified baseWordRound from native payloads', () => {
    expect(
      parseRoundFinishedNotificationData({
        type: 'round_finished',
        gameId: 'hmqy2',
        baseWordRound: '3',
      }),
    ).toEqual({ type: 'round_finished', gameId: 'HMQY2', baseWordRound: 3 });
  });

  it('rejects payloads without baseWordRound (would open the wrong round)', () => {
    expect(
      parseRoundFinishedNotificationData({
        type: 'round_finished',
        gameId: 'ABCDE',
      }),
    ).toBeNull();
  });

  it('ignores unknown payloads', () => {
    expect(parseRoundFinishedNotificationData({ type: 'other' })).toBeNull();
  });
});
