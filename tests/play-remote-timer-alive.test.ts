import { describe, expect, it, vi } from 'vitest';

import { beginExpireFinishAttempt } from '../lib/online/play-expire-finish.js';
import { isRemoteRoundClockStillRunning } from '../lib/online/play-remote-timer-alive.js';

describe('isRemoteRoundClockStillRunning', () => {
  it('is true while paused even when timerEndsAt is null', () => {
    expect(
      isRemoteRoundClockStillRunning(
        {
          status: 'playing',
          timerEndsAt: null,
          pauseState: { active: true, frozenRemainingMs: 60_000, frozenAt: 1 },
        },
        10_000,
      ),
    ).toBe(true);
  });

  it('is true when remote timerEndsAt is still in the future', () => {
    expect(
      isRemoteRoundClockStillRunning(
        { status: 'playing', timerEndsAt: 20_000, pauseState: null },
        10_000,
      ),
    ).toBe(true);
  });

  it('is false when remote timer has elapsed', () => {
    expect(
      isRemoteRoundClockStillRunning(
        { status: 'playing', timerEndsAt: 5_000, pauseState: null },
        10_000,
      ),
    ).toBe(false);
  });

  it('is false when session is finished', () => {
    expect(
      isRemoteRoundClockStillRunning(
        { status: 'finished', timerEndsAt: 20_000, pauseState: null },
        10_000,
      ),
    ).toBe(false);
  });
});

describe('beginExpireFinishAttempt remote clock heal', () => {
  function expireRefs(overrides?: Partial<Record<string, unknown>>) {
    return {
      finishAttempted: { current: false },
      finishInFlight: { current: false },
      expiredFailCount: { current: 0 },
      localRoundOverForced: { current: false },
      draftKeyIndices: { current: [] as number[] },
      lastValidatedDraft: { current: '' },
      ...overrides,
    };
  }

  it('does not force local round-over when remote clock is still alive', async () => {
    const onLocalRoundOver = vi.fn();
    const resyncIfRemoteClockAlive = vi.fn(async () => true);
    const refs = expireRefs({ expiredFailCount: { current: 1 } });
    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: false,
      refs,
      clearElapsedDraft: vi.fn(),
      onLocalRoundOver,
      finishIfExpired: async () => false,
      getNow: () => 2000,
      resyncIfRemoteClockAlive,
    });
    await vi.waitFor(() => expect(resyncIfRemoteClockAlive).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(refs.finishInFlight.current).toBe(false));
    expect(onLocalRoundOver).not.toHaveBeenCalled();
    expect(refs.expiredFailCount.current).toBe(0);
    expect(refs.localRoundOverForced.current).toBe(false);
  });
});
