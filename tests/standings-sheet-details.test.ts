import { describe, expect, it } from 'vitest';

import {
  buildStandingsSheetDetails,
  countDistinctRoomWords,
} from '../lib/online/standings-sheet-details.js';

const t = (key: string, opts?: Record<string, unknown>) => {
  if (key === 'game.wordsOfMax') {
    return `${opts?.words} з ${opts?.max}`;
  }
  return key;
};

describe('countDistinctRoomWords', () => {
  it('returns 0 for undefined / empty', () => {
    expect(countDistinctRoomWords(undefined)).toBe(0);
    expect(countDistinctRoomWords({})).toBe(0);
  });

  it('counts distinct normalized keys (not players per word)', () => {
    expect(
      countDistinctRoomWords({
        кіт: { a: true, b: true },
        пес: { a: true },
      }),
    ).toBe(2);
  });
});

describe('buildStandingsSheetDetails', () => {
  it('builds room, base word, round, progress caption, duration, x2', () => {
    const details = buildStandingsSheetDetails(t, {
      gameId: 'l8nn5',
      maxPlayableWords: 1705,
      session: {
        baseWord: 'компʼютер',
        baseWordRound: 4,
        wordPlayers: { кіт: { a: true }, пес: { b: true } },
        settings: {
          durationSeconds: 180,
          uniqueBonusEnabled: true,
          uniqueBonusMode: 'auto',
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {
          a: { name: 'A', score: 0, wordCount: 1, online: true },
          b: { name: 'B', score: 0, wordCount: 1, online: true },
          c: { name: 'C', score: 0, wordCount: 0, online: true },
        },
        liveRoundPlayerUids: ['a', 'b', 'c'],
        status: 'playing',
      },
    });

    expect(details.roomCodeRaw).toBe('L8NN5');
    expect(details.roomCodeDisplay).toContain('L');
    expect(details.round).toBe(5);
    expect(details.distinctWordCount).toBe(2);
    expect(details.wordsCollectedCaption).toContain('1705');
    expect(details.durationMinutes).toBe(3);
    expect(details.uniqueBonusEnabled).toBe(true);
    expect(details.baseWordDisplay.length).toBeGreaterThan(0);
  });

  it('uses roundTimerBudgetSeconds so approved add-time is included', () => {
    const details = buildStandingsSheetDetails(t, {
      gameId: 'DSSN2',
      maxPlayableWords: null,
      session: {
        baseWord: 'тест',
        baseWordRound: 0,
        wordPlayers: {},
        roundTimerBudgetSeconds: 420,
        settings: {
          durationSeconds: 300,
          uniqueBonusEnabled: false,
          uniqueBonusMode: 'off',
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: { a: { name: 'A', score: 0, wordCount: 0, online: true } },
        status: 'playing',
      },
    });
    expect(details.durationMinutes).toBe(7);
  });

  it('omits max in caption when lexicon max unknown', () => {
    const details = buildStandingsSheetDetails(t, {
      gameId: 'ABCDE',
      maxPlayableWords: null,
      session: {
        baseWord: 'тест',
        baseWordRound: 1,
        wordPlayers: { а: { a: true } },
        settings: {
          durationSeconds: 60,
          uniqueBonusEnabled: false,
          uniqueBonusMode: 'off',
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: { a: { name: 'A', score: 0, wordCount: 1, online: true } },
        status: 'playing',
      },
    });
    expect(details.distinctWordCount).toBe(1);
    expect(details.wordsCollectedCaption).toMatch(/1/);
    expect(details.wordsCollectedCaption).not.toMatch(/\sз\s/);
  });

  it('maps machine baseWordRound 0 to human round 1', () => {
    const details = buildStandingsSheetDetails(t, {
      gameId: 'ABCDE',
      maxPlayableWords: null,
      session: {
        baseWord: 'тест',
        baseWordRound: 0,
        wordPlayers: {},
        settings: {
          durationSeconds: 60,
          uniqueBonusEnabled: false,
          uniqueBonusMode: 'off',
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: { a: { name: 'A', score: 0, wordCount: 0, online: true } },
        status: 'playing',
      },
    });
    expect(details.round).toBe(1);
  });
});
