import { describe, expect, it } from 'vitest';

import {
  resolveRoundSuccessLevel,
  resolveSuccessBarSegment,
  wordsNeeded,
} from '@/lib/game/solo-round-success';

describe('wordsNeeded', () => {
  it('progress leaving zero is always 1', () => {
    expect(wordsNeeded('progress', 80)).toBe(1);
    expect(wordsNeeded('progress', 308)).toBe(1);
    expect(wordsNeeded('progress', 5000)).toBe(1);
  });

  it('uses min(ceil(ratio * max), abs) for tiers', () => {
    // 308: goodPace min(ceil(15.4), 25) = 16; strong min(ceil(61.6), 100) = 62
    expect(wordsNeeded('goodPace', 308)).toBe(16);
    expect(wordsNeeded('strong', 308)).toBe(62);
    expect(wordsNeeded('top', 308)).toBe(93);
    expect(wordsNeeded('champion', 308)).toBe(154);

    // 5000: abs caps dominate
    expect(wordsNeeded('goodPace', 5000)).toBe(25);
    expect(wordsNeeded('strong', 5000)).toBe(100);
    expect(wordsNeeded('top', 5000)).toBe(200);
    expect(wordsNeeded('champion', 5000)).toBe(300);

    // 80: ratio dominates (small lexicon)
    expect(wordsNeeded('goodPace', 80)).toBe(4);
    expect(wordsNeeded('strong', 80)).toBe(16);
    expect(wordsNeeded('top', 80)).toBe(24);
    expect(wordsNeeded('champion', 80)).toBe(40);
  });

  it('falls back safely for invalid lexicon', () => {
    expect(wordsNeeded('goodPace', 0)).toBe(1);
    expect(wordsNeeded('goodPace', -1)).toBe(1);
  });
});

describe('resolveRoundSuccessLevel', () => {
  it('returns none for zero words or invalid lexicon', () => {
    expect(resolveRoundSuccessLevel(0, 308)).toBe('none');
    expect(resolveRoundSuccessLevel(5, 0)).toBe('none');
  });

  it('returns progress for 1..before goodPace on large lexicons', () => {
    expect(resolveRoundSuccessLevel(1, 5000)).toBe('progress');
    expect(resolveRoundSuccessLevel(24, 5000)).toBe('progress');
    expect(resolveRoundSuccessLevel(25, 5000)).toBe('goodPace');
  });

  it('hits absolute boundaries on large lexicons (5000)', () => {
    expect(resolveRoundSuccessLevel(99, 5000)).toBe('goodPace');
    expect(resolveRoundSuccessLevel(100, 5000)).toBe('strong');
    expect(resolveRoundSuccessLevel(199, 5000)).toBe('strong');
    expect(resolveRoundSuccessLevel(200, 5000)).toBe('top');
    expect(resolveRoundSuccessLevel(299, 5000)).toBe('top');
    expect(resolveRoundSuccessLevel(300, 5000)).toBe('champion');
  });

  it('uses ratio thresholds on medium lexicon (308)', () => {
    expect(resolveRoundSuccessLevel(15, 308)).toBe('progress');
    expect(resolveRoundSuccessLevel(16, 308)).toBe('goodPace');
    expect(resolveRoundSuccessLevel(61, 308)).toBe('goodPace');
    expect(resolveRoundSuccessLevel(62, 308)).toBe('strong');
    expect(resolveRoundSuccessLevel(92, 308)).toBe('strong');
    expect(resolveRoundSuccessLevel(93, 308)).toBe('top');
    expect(resolveRoundSuccessLevel(153, 308)).toBe('top');
    expect(resolveRoundSuccessLevel(154, 308)).toBe('champion');
  });

  it('ratio dominates on small lexicon (80)', () => {
    expect(resolveRoundSuccessLevel(1, 80)).toBe('progress');
    expect(resolveRoundSuccessLevel(3, 80)).toBe('progress');
    expect(resolveRoundSuccessLevel(4, 80)).toBe('goodPace');
    expect(resolveRoundSuccessLevel(16, 80)).toBe('strong');
    expect(resolveRoundSuccessLevel(24, 80)).toBe('top');
    expect(resolveRoundSuccessLevel(40, 80)).toBe('champion');
  });
});

describe('resolveSuccessBarSegment', () => {
  it('none → progress segment starts at 0 ends at 1', () => {
    const seg = resolveSuccessBarSegment(0, 308);
    expect(seg.levelId).toBe('none');
    expect(seg.startWords).toBe(0);
    expect(seg.endWords).toBe(1);
    expect(seg.fill01).toBe(0);
    expect(seg.nextLevelId).toBe('progress');
    expect(seg.wordsToNext).toBe(1);
  });

  it('fills toward goodPace while in progress', () => {
    const seg = resolveSuccessBarSegment(8, 5000);
    expect(seg.levelId).toBe('progress');
    expect(seg.startWords).toBe(1);
    expect(seg.endWords).toBe(25);
    expect(seg.fill01).toBeCloseTo((8 - 1) / (25 - 1));
    expect(seg.nextLevelId).toBe('goodPace');
    expect(seg.wordsToNext).toBe(17);
  });

  it('champion is full with no next', () => {
    const seg = resolveSuccessBarSegment(300, 5000);
    expect(seg.levelId).toBe('champion');
    expect(seg.fill01).toBe(1);
    expect(seg.nextLevelId).toBe(null);
    expect(seg.wordsToNext).toBe(0);
  });
});
