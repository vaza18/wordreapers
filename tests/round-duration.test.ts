import { describe, expect, it } from 'vitest';

import {
  computeRoundDurationSeconds,
  computeRoundPlayedSecondsAtFinish,
  computeRoundPlayedSecondsFromTimerState,
  computeWordsPerMinute,
  formatRoundDuration,
} from '../lib/game/round-duration.js';
import type { GameSession } from '../lib/firebase/types.js';

function finishedSession(
  durationSeconds: number,
  options?: {
    finishedAt?: number;
    roundStartedAt?: number;
    roundPlayedSeconds?: number;
    roundTimerBudgetSeconds?: number;
  },
): GameSession {
  const finishedAt = options?.finishedAt ?? durationSeconds * 1000;
  const roundStartedAt = options?.roundStartedAt ?? finishedAt - durationSeconds * 1000;
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
    roundStartedAt,
    roundTimerBudgetSeconds: options?.roundTimerBudgetSeconds ?? durationSeconds,
    roundPlayedSeconds: options?.roundPlayedSeconds,
    finishedAt,
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

describe('computeRoundPlayedSecondsAtFinish', () => {
  it('uses timer budget minus remaining (pauses excluded from displayed time)', () => {
    const session: GameSession = {
      ...finishedSession(300),
      status: 'playing',
      roundTimerBudgetSeconds: 300,
      timerEndsAt: null,
      pauseState: {
        active: true,
        frozenRemainingMs: 0,
        frozenAt: 360_000,
      },
    };
    expect(computeRoundPlayedSecondsAtFinish(session, 360_000)).toBe(300);
  });

  it('reflects early finish from remaining countdown', () => {
    const session: GameSession = {
      ...finishedSession(300),
      status: 'playing',
      roundTimerBudgetSeconds: 300,
      timerEndsAt: 420_000,
    };
    expect(computeRoundPlayedSecondsAtFinish(session, 240_000)).toBe(120);
  });
});

describe('computeRoundDurationSeconds', () => {
  it('prefers stored roundPlayedSeconds on finished sessions', () => {
    expect(
      computeRoundDurationSeconds(
        finishedSession(300, {
          roundStartedAt: 60_000,
          finishedAt: 420_000,
          roundPlayedSeconds: 300,
        }),
      ),
    ).toBe(300);
  });

  it('uses configured duration when no timestamps exist', () => {
    expect(computeRoundDurationSeconds(finishedSession(600))).toBe(600);
  });

  it('derives elapsed time from roundPlayedSeconds for early finish', () => {
    const byPlayer = new Map([
      [
        'p1',
        new Map([
          ['рот', { at: 1_000 }],
          ['тор', { at: 181_000 }],
        ]),
      ],
    ]);
    expect(
      computeRoundDurationSeconds(finishedSession(600, { roundPlayedSeconds: 180 }), byPlayer),
    ).toBe(180);
  });

  it('shows full configured time when timer ran out despite a late first word', () => {
    const session = finishedSession(300, { roundPlayedSeconds: 300 });
    const byPlayer = new Map([
      ['p1', new Map([['a', { at: 1_007_000 }]])],
      ['p2', new Map([['b', { at: 1_240_000 }]])],
    ]);
    expect(computeRoundDurationSeconds(session, byPlayer)).toBe(300);
    expect(formatRoundDuration(300)).toBe('5 хв');
  });

  it('falls back to word timestamps for legacy sessions without roundPlayedSeconds', () => {
    const session: GameSession = {
      ...finishedSession(600),
      roundPlayedSeconds: undefined,
      roundStartedAt: undefined,
      finishedAt: undefined,
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
    expect(computeRoundDurationSeconds(session, byPlayer)).toBe(180);
  });
});

describe('computeRoundPlayedSecondsFromTimerState', () => {
  it('matches the user pause example (5 min game, 6 min wall clock)', () => {
    expect(
      computeRoundPlayedSecondsFromTimerState({
        budgetSeconds: 300,
        remainingMs: 0,
      }),
    ).toBe(300);
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
