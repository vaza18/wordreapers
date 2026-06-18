import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { shouldMarkResultsExited } from '../lib/online/results-viewed.js';

function session(players: GameSession['players']): GameSession {
  return {
    baseWord: 'тест',
    status: 'finished',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'a',
    players,
  };
}

describe('shouldMarkResultsExited', () => {
  it('skips when already marked', () => {
    const s = session({
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    expect(shouldMarkResultsExited({ ...s, resultsExitedBy: { a: true } }, 'a')).toBe(false);
  });

  it('skips early leavers already offline', () => {
    const s = session({
      a: { name: 'A', wordCount: 0, score: 0, online: true },
      b: { name: 'B', wordCount: 0, score: 0, hasLeft: true, online: false },
    });
    expect(shouldMarkResultsExited(s, 'b')).toBe(false);
    expect(shouldMarkResultsExited(s, 'a')).toBe(true);
  });
});
