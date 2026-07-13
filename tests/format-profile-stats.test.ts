import { describe, expect, it } from 'vitest';

import {
  formatCompetitionStatsLine,
  formatProfileStatsGamesLine,
  formatProfileStatsSummary,
  formatProfileStatsWordsLine,
  formatTrainingStatsLine,
} from '@/lib/profile/format-profile-stats';

describe('formatProfileStatsGamesLine', () => {
  it('formats games and wins with Ukrainian plural forms', () => {
    expect(formatProfileStatsGamesLine(1, 1)).toBe('1 гра · 1 перемога');
    expect(formatProfileStatsGamesLine(2, 3)).toBe('2 гри · 3 перемоги');
    expect(formatProfileStatsGamesLine(8, 8)).toBe('8 ігор · 8 перемог');
    expect(formatProfileStatsGamesLine(21, 11)).toBe('21 гра · 11 перемог');
  });
});

describe('formatProfileStatsWordsLine', () => {
  it('formats collected words with Ukrainian plural', () => {
    expect(formatProfileStatsWordsLine(185)).toBe('185 слів');
    expect(formatProfileStatsWordsLine(1)).toBe('1 слово');
  });
});

describe('formatProfileStatsSummary', () => {
  it('joins games and words lines for single-line layouts', () => {
    expect(formatProfileStatsSummary(8, 8, 185)).toBe('8 ігор · 8 перемог · 185 слів');
    expect(formatProfileStatsSummary(1, 1, 1)).toBe('1 гра · 1 перемога · 1 слово');
    expect(formatProfileStatsSummary(10, 5, 158)).toBe('10 ігор · 5 перемог · 158 слів');
  });
});

describe('formatCompetitionStatsLine', () => {
  it('labels competition games, wins, and words', () => {
    expect(formatCompetitionStatsLine({ gamesPlayed: 2, gamesWon: 1, wordsCollected: 6 })).toBe(
      'Змагання: 2 гри · 1 перемога · 6 слів',
    );
    expect(formatCompetitionStatsLine({ gamesPlayed: 1, gamesWon: 1, wordsCollected: 1 })).toBe(
      'Змагання: 1 гра · 1 перемога · 1 слово',
    );
  });
});

describe('formatTrainingStatsLine', () => {
  it('labels training rounds and words without wins', () => {
    expect(formatTrainingStatsLine({ roundsPlayed: 1, wordsCollected: 8 })).toBe(
      'Тренування: 1 раунд · 8 слів',
    );
    expect(formatTrainingStatsLine({ roundsPlayed: 5, wordsCollected: 21 })).toBe(
      'Тренування: 5 раундів · 21 слово',
    );
  });
});
