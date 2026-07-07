import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  hasActiveOpponent,
  hasOnlineOpponent,
  onlineActiveOpponentNames,
} from '../lib/online/presence/session-presence.js';

function session(players: GameSession['players']): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'me',
    players,
  };
}

describe('hasActiveOpponent', () => {
  it('is false when no other players remain in the round', () => {
    expect(
      hasActiveOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
        }),
        'me',
      ),
    ).toBe(false);
    expect(
      hasActiveOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          b: { name: 'B', wordCount: 0, score: 0, hasLeft: true },
        }),
        'me',
      ),
    ).toBe(false);
  });

  it('is false when another player is offline without joining the live round', () => {
    expect(
      hasActiveOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: false },
        }),
        'me',
      ),
    ).toBe(false);
  });

  it('is true when another live-round participant is offline but has scored', () => {
    expect(
      hasActiveOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 2, score: 2, online: false },
        }),
        'me',
      ),
    ).toBe(true);
  });
});

describe('hasOnlineOpponent', () => {
  it('is false when others are offline or left without session activity', () => {
    expect(
      hasOnlineOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: false },
          b: { name: 'B', wordCount: 0, score: 0, hasLeft: true },
        }),
        'me',
      ),
    ).toBe(false);
  });

  it('is false when an offline roster member has stale counters cleared (not in round)', () => {
    expect(
      hasOnlineOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: false },
        }),
        'me',
      ),
    ).toBe(false);
  });

  it('is true when an opponent is offline but has scored this round', () => {
    expect(
      hasOnlineOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 2, score: 3, online: false },
        }),
        'me',
      ),
    ).toBe(true);
  });

  it('is true when another player is online', () => {
    expect(
      hasOnlineOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: true },
        }),
        'me',
      ),
    ).toBe(true);
  });

  it('is true when opponent has stale hasLeft but is still online', () => {
    expect(
      hasOnlineOpponent(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'A', wordCount: 0, score: 0, online: true, hasLeft: true },
        }),
        'me',
      ),
    ).toBe(true);
  });
});

describe('onlineActiveOpponentNames', () => {
  it('lists only connected rostered opponents', () => {
    expect(
      onlineActiveOpponentNames(
        session({
          me: { name: 'Me', wordCount: 0, score: 0, online: true },
          a: { name: 'Аня', wordCount: 0, score: 0, online: true },
          b: { name: 'Богдан', wordCount: 0, score: 0, online: false },
        }),
        'me',
      ),
    ).toEqual(['Аня']);
  });
});
