import { describe, expect, it } from 'vitest';

import {
  formatPlayStatsAccessible,
  formatPlayStatsCompact,
  formatPlayStatsCompactSegments,
  formatStandingRowMeta,
} from '@/lib/game/format-play-stats';

describe('formatPlayStatsCompact', () => {
  it('formats rank, words with max, and score', () => {
    expect(
      formatPlayStatsCompact({
        rank: 2,
        wordCount: 12,
        maxWordCount: 571,
        score: 14,
      }),
    ).toBe('2м · 12/571сл · 14оч');
  });

  it('omits max when not provided', () => {
    expect(
      formatPlayStatsCompact({
        rank: 1,
        wordCount: 3,
        score: 5,
      }),
    ).toBe('1м · 3сл · 5оч');
  });
});

describe('formatPlayStatsCompactSegments', () => {
  it('marks max word count as de-emphasized', () => {
    expect(
      formatPlayStatsCompactSegments({
        rank: 1,
        wordCount: 102,
        maxWordCount: 1460,
        score: 160,
      }),
    ).toEqual([
      { text: '1м', variant: 'normal' },
      { text: ' · ', variant: 'normal' },
      { text: '102', variant: 'normal' },
      { text: '/1460', variant: 'deemphasized' },
      { text: 'сл', variant: 'normal' },
      { text: ' · ', variant: 'normal' },
      { text: '160оч', variant: 'normal' },
    ]);
  });
});

describe('formatPlayStatsAccessible', () => {
  it('uses full Ukrainian words', () => {
    expect(
      formatPlayStatsAccessible({
        rank: 2,
        wordCount: 12,
        maxWordCount: 571,
        score: 14,
      }),
    ).toBe('2 місце · 12 слів з 571 · 14 очок');
  });

  it('formats singular score', () => {
    expect(
      formatPlayStatsAccessible({
        rank: 1,
        wordCount: 1,
        score: 1,
      }),
    ).toBe('1 місце · 1 слово · 1 очко');
  });
});

describe('formatStandingRowMeta', () => {
  it('joins words and points with full forms', () => {
    expect(formatStandingRowMeta(12, 14)).toBe('12 слів · 14 очок');
  });

  it('returns words only when score is null', () => {
    expect(formatStandingRowMeta(5, null)).toBe('5 слів');
  });
});
