import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  hasOptedIntoNextRound,
  rematchWaitingPlayerPatch,
} from '../lib/online/live-round-membership.js';

function finishedSession(resultsExitedBy?: Record<string, boolean>): GameSession {
  return {
    baseWord: 'тест',
    status: 'finished',
    baseWordRound: 0,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 3, score: 3, online: true },
      p2: { name: 'Two', wordCount: 2, score: 2, online: true },
      p3: { name: 'Three', wordCount: 1, score: 1, online: true },
    },
    resultsExitedBy,
  };
}

describe('hasOptedIntoNextRound', () => {
  it('includes the actor and players who left results via Play again', () => {
    const session = finishedSession({ org: true, p2: true });
    expect(hasOptedIntoNextRound(session, 'org', 'org')).toBe(true);
    expect(hasOptedIntoNextRound(session, 'p2', 'org')).toBe(true);
    expect(hasOptedIntoNextRound(session, 'p3', 'org')).toBe(false);
  });
});

describe('rematchWaitingPlayerPatch', () => {
  it('keeps only rematch participants online', () => {
    const session = finishedSession({ org: true });
    expect(rematchWaitingPlayerPatch(session, 'org', 'org')).toEqual({
      score: 0,
      wordCount: 0,
      online: true,
      hasLeft: false,
    });
    expect(rematchWaitingPlayerPatch(session, 'p3', 'org')).toEqual({
      score: 0,
      wordCount: 0,
      online: false,
      hasLeft: false,
    });
  });
});
