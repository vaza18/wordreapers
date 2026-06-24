import { describe, expect, it } from 'vitest';

import {
  formatProfileStatsGamesLine,
  formatProfileStatsSummary,
  formatProfileStatsWordsLine,
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
    expect(formatProfileStatsWordsLine(185)).toBe('185 зібраних слів');
    expect(formatProfileStatsWordsLine(1)).toBe('1 зібране слово');
  });
});

describe('formatProfileStatsSummary', () => {
  it('joins games and words lines for single-line layouts', () => {
    expect(formatProfileStatsSummary(8, 8, 185)).toBe('8 ігор · 8 перемог · 185 зібраних слів');
    expect(formatProfileStatsSummary(1, 1, 1)).toBe('1 гра · 1 перемога · 1 зібране слово');
    expect(formatProfileStatsSummary(10, 5, 158)).toBe('10 ігор · 5 перемог · 158 зібраних слів');
  });
});
