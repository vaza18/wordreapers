import { describe, expect, it } from 'vitest';

import { SOLO_SUCCESS_GOOD_PACE_RATIO } from '@/constants/solo-round-success-constants';
import { wordsNeeded } from '@/lib/game/solo-round-success';
import {
  meetsTrainingMilestone,
  trainingWordsRequired,
  wordsUntilTrainingUnlock,
} from '@/lib/onboarding/training-milestone';

describe('meetsTrainingMilestone', () => {
  it('unlocks using goodPace ratio constant (0.05)', () => {
    expect(SOLO_SUCCESS_GOOD_PACE_RATIO).toBe(0.05);
    expect(trainingWordsRequired(200)).toBe(wordsNeeded('goodPace', 200));
  });

  it('rejects zero words or zero lexicon', () => {
    expect(meetsTrainingMilestone(0, 571)).toBe(false);
    expect(meetsTrainingMilestone(5, 0)).toBe(false);
    expect(meetsTrainingMilestone(0, 0)).toBe(false);
  });

  it('unlocks at wordsNeeded(goodPace) — min(ceil(5%), 25)', () => {
    // 200 → ceil(10) = 10
    expect(trainingWordsRequired(200)).toBe(10);
    expect(meetsTrainingMilestone(9, 200)).toBe(false);
    expect(meetsTrainingMilestone(10, 200)).toBe(true);

    // 571 → ceil(28.55) = 29, capped at 25
    expect(trainingWordsRequired(571)).toBe(25);
    expect(meetsTrainingMilestone(24, 571)).toBe(false);
    expect(meetsTrainingMilestone(25, 571)).toBe(true);
  });

  it('scales with small lexicons (10 → need at least 1 word)', () => {
    expect(meetsTrainingMilestone(0, 10)).toBe(false);
    expect(meetsTrainingMilestone(1, 10)).toBe(true);
  });

  it('matches wordsNeeded(goodPace) for typical sizes', () => {
    expect(meetsTrainingMilestone(29, 571)).toBe(true);
    expect(trainingWordsRequired(571)).toBe(wordsNeeded('goodPace', 571));
  });

  it('trainingWordsRequired equals the smallest word count that unlocks', () => {
    expect(trainingWordsRequired(200)).toBe(10);
    expect(trainingWordsRequired(571)).toBe(25);
    expect(meetsTrainingMilestone(25, 571)).toBe(true);
    expect(meetsTrainingMilestone(24, 571)).toBe(false);
  });

  it('trainingWordsRequired stays consistent with meetsTrainingMilestone', () => {
    for (const max of [10, 21, 55, 200, 231, 571, 1442, 5000]) {
      const required = trainingWordsRequired(max);
      expect(required).toBe(wordsNeeded('goodPace', max));
      expect(meetsTrainingMilestone(required, max)).toBe(true);
      expect(meetsTrainingMilestone(required - 1, max)).toBe(false);
    }
  });

  it('wordsUntilTrainingUnlock counts remaining words', () => {
    expect(wordsUntilTrainingUnlock(0, 200)).toBe(10);
    expect(wordsUntilTrainingUnlock(9, 200)).toBe(1);
    expect(wordsUntilTrainingUnlock(10, 200)).toBe(0);
  });
});
