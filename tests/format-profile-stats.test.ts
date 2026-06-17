import { describe, expect, it } from 'vitest';

import {
  formatProfileStatsGamesLine,
  formatProfileStatsSummary,
  formatProfileStatsWordsLine,
} from '@/lib/profile/format-profile-stats';

describe('formatProfileStatsGamesLine', () => {
  it('formats games and wins', () => {
    expect(formatProfileStatsGamesLine(8, 8)).toBe('8 ігор · 8 перемог');
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
    expect(formatProfileStatsSummary(1, 1, 1)).toBe('1 ігор · 1 перемог · 1 зібране слово');
  });
});
