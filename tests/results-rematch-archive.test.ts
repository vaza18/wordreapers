import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { isFinishedArchiveStale } from '../lib/online/online-session-archive.js';

function finishedSession(baseWordRound: number): GameSession {
  return {
    baseWord: 'тест',
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
    organizerId: 'a',
    players: {
      a: { name: 'A', wordCount: 1, score: 1 },
      b: { name: 'B', wordCount: 1, score: 1 },
    },
  };
}

describe('results rematch archive staleness', () => {
  it('treats prior-round ack as stale for the current finished session', () => {
    const round0Archive = {
      gameId: 'ABCD',
      baseWordRound: 0,
      savedAt: 1,
      session: finishedSession(0),
      playerWords: {},
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
    };
    const round1Live = finishedSession(1);

    expect(isFinishedArchiveStale(round0Archive, round1Live)).toBe(true);
  });

  it('accepts ack for the same round', () => {
    const round1Archive = {
      gameId: 'ABCD',
      baseWordRound: 1,
      savedAt: 2,
      session: finishedSession(1),
      playerWords: {},
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
    };

    expect(isFinishedArchiveStale(round1Archive, finishedSession(1))).toBe(false);
  });
});
