import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolveRoundEndSessionSnapshot } from '../lib/online/resolve-round-end-session-snapshot.js';

function finishedRound(baseWordRound: number, baseWord: string): GameSession {
  return {
    baseWord,
    status: 'finished',
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
      org: { name: 'Org', wordCount: 0, score: 0, online: false },
    },
  };
}

describe('resolveRoundEndSessionSnapshot', () => {
  it('keeps the frozen earlier round when a later round finishes in RTDB', () => {
    const round1 = finishedRound(0, 'судоустрій');
    const round2 = finishedRound(1, 'самомащення');
    expect(resolveRoundEndSessionSnapshot(round1, round2)).toBe(round1);
  });

  it('captures the first finished snapshot for the active round', () => {
    const round1 = finishedRound(0, 'судоустрій');
    expect(resolveRoundEndSessionSnapshot(null, round1)).toEqual(round1);
  });

  it('refreshes when the same round finishes again in RTDB', () => {
    const round1a = finishedRound(0, 'судоустрій');
    const round1b = { ...finishedRound(0, 'судоустрій'), finishedAt: 123 };
    expect(resolveRoundEndSessionSnapshot(round1a, round1b)).toBe(round1a);
  });
});
