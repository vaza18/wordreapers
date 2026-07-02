import { describe, expect, it } from 'vitest';

import {
  TRAINING_MILESTONE_LEXICON_RATIO,
  meetsTrainingMilestone,
  trainingWordsRequired,
  wordsUntilTrainingUnlock,
} from '@/lib/onboarding/training-milestone';

describe('meetsTrainingMilestone', () => {
  it('uses 5% lexicon ratio', () => {
    expect(TRAINING_MILESTONE_LEXICON_RATIO).toBe(0.05);
  });

  it('rejects zero words or zero lexicon', () => {
    expect(meetsTrainingMilestone(0, 571)).toBe(false);
    expect(meetsTrainingMilestone(5, 0)).toBe(false);
    expect(meetsTrainingMilestone(0, 0)).toBe(false);
  });

  it('requires strictly more than 5%', () => {
    const lexicon = 200;
    const threshold = lexicon * 0.05;
    expect(threshold).toBe(10);
    expect(meetsTrainingMilestone(10, lexicon)).toBe(false);
    expect(meetsTrainingMilestone(11, lexicon)).toBe(true);
  });

  it('scales with small lexicons (10 → need at least 1 word)', () => {
    expect(meetsTrainingMilestone(0, 10)).toBe(false);
    expect(meetsTrainingMilestone(1, 10)).toBe(true);
  });

  it('passes for typical training round (29/571)', () => {
    expect(meetsTrainingMilestone(29, 571)).toBe(true);
  });

  it('trainingWordsRequired equals the smallest word count that unlocks', () => {
    // Exact multiple: >10 → need 11.
    expect(trainingWordsRequired(200)).toBe(11);
    // Fractional threshold 28.55 → need 29 (floor + 1), matching meetsTrainingMilestone.
    expect(trainingWordsRequired(571)).toBe(29);
    expect(meetsTrainingMilestone(29, 571)).toBe(true);
    expect(meetsTrainingMilestone(28, 571)).toBe(false);
  });

  it('trainingWordsRequired stays consistent with meetsTrainingMilestone', () => {
    for (const max of [10, 21, 55, 200, 231, 571, 1442]) {
      const required = trainingWordsRequired(max);
      expect(meetsTrainingMilestone(required, max)).toBe(true);
      expect(meetsTrainingMilestone(required - 1, max)).toBe(false);
    }
  });

  it('wordsUntilTrainingUnlock counts remaining words', () => {
    expect(wordsUntilTrainingUnlock(0, 200)).toBe(11);
    expect(wordsUntilTrainingUnlock(10, 200)).toBe(1);
    expect(wordsUntilTrainingUnlock(11, 200)).toBe(0);
  });
});
