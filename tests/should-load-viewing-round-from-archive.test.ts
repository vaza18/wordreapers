import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { shouldLoadViewingRoundFromArchive } from '../lib/online/frozen-round-view.js';

function session(status: GameSession['status'], baseWordRound: number): GameSession {
  return {
    baseWord: 'тест',
    status,
    baseWordRound,
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
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
  };
}

describe('shouldLoadViewingRoundFromArchive', () => {
  it('loads a pinned round while live advanced or absent', () => {
    expect(shouldLoadViewingRoundFromArchive(0, null)).toBe(true);
    expect(shouldLoadViewingRoundFromArchive(0, session('playing', 1))).toBe(true);
    expect(shouldLoadViewingRoundFromArchive(0, session('finished', 1))).toBe(true);
  });

  it('skips archive load when viewing matches live finished round', () => {
    expect(shouldLoadViewingRoundFromArchive(1, session('finished', 1))).toBe(false);
    expect(shouldLoadViewingRoundFromArchive(null, session('finished', 1))).toBe(false);
  });
});
