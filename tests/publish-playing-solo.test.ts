import { describe, expect, it } from 'vitest';

import { buildPlayingSoloTimerFields } from '@/lib/online/publish-playing-solo-fields';

describe('buildPlayingSoloTimerFields', () => {
  it('keeps the timer running when the round is active', () => {
    expect(buildPlayingSoloTimerFields(90_000, false, 1_000)).toEqual({
      timerEndsAt: 91_000,
      pauseState: null,
    });
  });

  it('publishes pause state instead of a running timer when solo is paused', () => {
    expect(buildPlayingSoloTimerFields(90_000, true, 1_000)).toEqual({
      timerEndsAt: null,
      pauseState: {
        active: true,
        frozenRemainingMs: 90_000,
        frozenAt: 1_000,
      },
    });
  });
});
