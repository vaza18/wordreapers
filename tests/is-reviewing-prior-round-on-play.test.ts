import { describe, expect, it } from 'vitest';

import { isReviewingPriorRoundOnPlayScreen } from '../lib/online/is-reviewing-prior-round-on-play.js';

describe('isReviewingPriorRoundOnPlayScreen', () => {
  it('is true while a finished round is frozen and live advanced', () => {
    expect(isReviewingPriorRoundOnPlayScreen(true, 0, 1)).toBe(true);
    expect(isReviewingPriorRoundOnPlayScreen(true, 1, 2)).toBe(true);
  });

  it('is false when still on the same round or not in round-ended UI', () => {
    expect(isReviewingPriorRoundOnPlayScreen(true, 1, 1)).toBe(false);
    expect(isReviewingPriorRoundOnPlayScreen(false, 0, 1)).toBe(false);
    expect(isReviewingPriorRoundOnPlayScreen(true, null, 1)).toBe(false);
  });
});
