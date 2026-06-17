import { describe, expect, it } from 'vitest';

import {
  computeRoundDurationSeconds,
  computeWordsPerMinute,
  formatRoundDuration,
} from '../lib/game/round-duration.js';
import type { GameSession } from '../lib/firebase/types.js';

function finishedSession(durationSeconds: number): GameSession {
  return {
    baseWord: 'порт',
    status: 'finished',
    settings: {
      durationSeconds,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'p1',
    players: {
      p1: { name: 'Аня', wordCount: 2, score: 2, avatarColorIndex: 0 },
    },
  };
}

describe('formatRoundDuration', () => {
  it('formats whole minutes in Ukrainian', () => {
    expect(formatRoundDuration(600)).toBe('10 хв');
  });

  it('formats minutes and seconds as MM:SS', () => {
    expect(formatRoundDuration(585)).toBe('9:45');
  });
});

describe('computeRoundDurationSeconds', () => {
  it('uses configured duration when no timestamps exist', () => {
    expect(computeRoundDurationSeconds(finishedSession(600))).toBe(600);
  });

  it('derives elapsed time from word timestamps and finish moment', () => {
    const byPlayer = new Map([
      [
        'p1',
        new Map([
          ['рот', { at: 1_000 }],
          ['тор', { at: 181_000 }],
        ]),
      ],
    ]);
    expect(computeRoundDurationSeconds(finishedSession(600), byPlayer, 181_000)).toBe(180);
  });

  it('uses session.finishedAt for elapsed time', () => {
    const session = {
      ...finishedSession(600),
      finishedAt: 301_000,
    };
    const byPlayer = new Map([
      [
        'p1',
        new Map([
          ['рот', { at: 1_000 }],
          ['тор', { at: 181_000 }],
        ]),
      ],
    ]);
    expect(computeRoundDurationSeconds(session, byPlayer)).toBe(300);
  });
});

describe('computeWordsPerMinute', () => {
  it('returns one decimal place', () => {
    expect(computeWordsPerMinute(10, 600)).toBe(1);
    expect(computeWordsPerMinute(5, 300)).toBe(1);
  });

  it('uses at least one minute as the denominator', () => {
    expect(computeWordsPerMinute(3, 30)).toBe(3);
  });
});
