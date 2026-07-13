import { describe, expect, it } from 'vitest';

import { NBSP } from '@/lib/i18n/uk-plural';
import {
  formatCompetitionStatsLine,
  formatProfileStatsGamesLine,
  formatProfileStatsSummary,
  formatProfileStatsWordsLine,
  formatTrainingStatsLine,
} from '@/lib/profile/format-profile-stats';

describe('formatProfileStatsGamesLine', () => {
  it('formats games and wins with Ukrainian plural forms', () => {
    expect(formatProfileStatsGamesLine(1, 1)).toBe(`1${NBSP}гра · 1${NBSP}перемога`);
    expect(formatProfileStatsGamesLine(2, 3)).toBe(`2${NBSP}гри · 3${NBSP}перемоги`);
    expect(formatProfileStatsGamesLine(8, 8)).toBe(`8${NBSP}ігор · 8${NBSP}перемог`);
    expect(formatProfileStatsGamesLine(21, 11)).toBe(`21${NBSP}гра · 11${NBSP}перемог`);
  });
});

describe('formatProfileStatsWordsLine', () => {
  it('formats collected words with Ukrainian plural', () => {
    expect(formatProfileStatsWordsLine(185)).toBe(`185${NBSP}слів`);
    expect(formatProfileStatsWordsLine(1)).toBe(`1${NBSP}слово`);
  });
});

describe('formatProfileStatsSummary', () => {
  it('joins games and words lines for single-line layouts', () => {
    expect(formatProfileStatsSummary(8, 8, 185)).toBe(
      `8${NBSP}ігор · 8${NBSP}перемог · 185${NBSP}слів`,
    );
    expect(formatProfileStatsSummary(1, 1, 1)).toBe(
      `1${NBSP}гра · 1${NBSP}перемога · 1${NBSP}слово`,
    );
    expect(formatProfileStatsSummary(10, 5, 158)).toBe(
      `10${NBSP}ігор · 5${NBSP}перемог · 158${NBSP}слів`,
    );
  });
});

describe('formatCompetitionStatsLine', () => {
  it('labels competition games, wins, and words', () => {
    expect(formatCompetitionStatsLine({ gamesPlayed: 2, gamesWon: 1, wordsCollected: 6 })).toBe(
      `Змагання: 2${NBSP}гри · 1${NBSP}перемога · 6${NBSP}слів`,
    );
    expect(formatCompetitionStatsLine({ gamesPlayed: 1, gamesWon: 1, wordsCollected: 1 })).toBe(
      `Змагання: 1${NBSP}гра · 1${NBSP}перемога · 1${NBSP}слово`,
    );
  });
});

describe('formatTrainingStatsLine', () => {
  it('labels training rounds and words without wins', () => {
    expect(formatTrainingStatsLine({ roundsPlayed: 1, wordsCollected: 8 })).toBe(
      `Тренування: 1${NBSP}раунд · 8${NBSP}слів`,
    );
    expect(formatTrainingStatsLine({ roundsPlayed: 5, wordsCollected: 21 })).toBe(
      `Тренування: 5${NBSP}раундів · 21${NBSP}слово`,
    );
    // Regression: Hermes Intl often maps 2/21 → English "other" (wrong many forms).
    expect(formatTrainingStatsLine({ roundsPlayed: 2, wordsCollected: 21 })).toBe(
      `Тренування: 2${NBSP}раунди · 21${NBSP}слово`,
    );
  });
});
