import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { allSessionPlayersOffline } from '../lib/online/session-offline.js';

function session(players: GameSession['players']): GameSession {
  return {
    baseWord: 'тест',
    status: 'waiting',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'org',
    players,
  };
}

describe('allSessionPlayersOffline', () => {
  it('returns true when every player is offline', () => {
    expect(
      allSessionPlayersOffline(
        session({
          a: { name: 'A', wordCount: 0, score: 0, online: false },
          b: { name: 'B', wordCount: 0, score: 0, online: false },
        }),
      ),
    ).toBe(true);
  });

  it('returns false when someone is still online', () => {
    expect(
      allSessionPlayersOffline(
        session({
          a: { name: 'A', wordCount: 0, score: 0, online: true },
          b: { name: 'B', wordCount: 0, score: 0, online: false },
        }),
      ),
    ).toBe(false);
  });

  it('treats missing online flag as offline', () => {
    expect(
      allSessionPlayersOffline(
        session({
          a: { name: 'A', wordCount: 0, score: 0 },
          b: { name: 'B', wordCount: 0, score: 0, online: false },
        }),
      ),
    ).toBe(true);
  });
});
