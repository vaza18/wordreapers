import { describe, expect, it } from 'vitest';

import { shouldFreezeLiveFinishedOnResults } from '../lib/online/should-freeze-live-finished-on-results.js';

describe('shouldFreezeLiveFinishedOnResults', () => {
  it('allows freezing when viewing the same or a later round', () => {
    expect(shouldFreezeLiveFinishedOnResults(1, null)).toBe(true);
    expect(shouldFreezeLiveFinishedOnResults(1, 1)).toBe(true);
    expect(shouldFreezeLiveFinishedOnResults(1, 2)).toBe(true);
  });

  it('blocks freezing live when viewing an earlier round', () => {
    expect(shouldFreezeLiveFinishedOnResults(1, 0)).toBe(false);
    expect(shouldFreezeLiveFinishedOnResults(2, 1)).toBe(false);
  });
});
