import { describe, expect, it } from 'vitest';

import { shouldKeepFrozenResultsOverLiveFinished } from '../lib/online/should-keep-frozen-results-over-live-finished.js';

describe('shouldKeepFrozenResultsOverLiveFinished', () => {
  it('keeps round 1 results when round 2 finishes elsewhere', () => {
    expect(shouldKeepFrozenResultsOverLiveFinished(0, 1)).toBe(true);
    expect(shouldKeepFrozenResultsOverLiveFinished(1, 2)).toBe(true);
  });

  it('does not block syncing the same finished round', () => {
    expect(shouldKeepFrozenResultsOverLiveFinished(1, 1)).toBe(false);
  });
});
