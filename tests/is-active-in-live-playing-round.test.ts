import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { isActiveInLivePlayingRound } from '../lib/online/is-active-in-live-playing-round.js';

function session(overrides: Partial<GameSession>): GameSession {
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
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p1: { name: 'One', wordCount: 0, score: 0, online: false },
    },
    ...overrides,
  };
}

describe('isActiveInLivePlayingRound', () => {
  it('requires playing status and online presence', () => {
    expect(isActiveInLivePlayingRound(session({}), 'org')).toBe(true);
    expect(isActiveInLivePlayingRound(session({}), 'p1')).toBe(false);
    expect(isActiveInLivePlayingRound(session({ status: 'finished' }), 'org')).toBe(false);
    expect(isActiveInLivePlayingRound(null, 'org')).toBe(false);
  });

  it('excludes players who left the round', () => {
    expect(
      isActiveInLivePlayingRound(
        session({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true, hasLeft: true },
          },
        }),
        'org',
      ),
    ).toBe(false);
  });
});
