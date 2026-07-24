import { describe, expect, it, vi } from 'vitest';

import { beginExpireFinishAttempt } from '../lib/online/play-expire-finish.js';
import { shouldClearPlayLocalWordsOnRoundChange } from '../lib/online/play-round-local-reset.js';
import {
  canOpenOnlineResults,
  shouldBlockWordSubmitWhenTimerElapsed,
  shouldLocalRoundOverAfterFailedExpires,
} from '../lib/online/play-timer-submit-gate.js';
import { rosterPlayerIdsKey } from '../lib/online/session/roster-player-ids-key.js';

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

describe('beginExpireFinishAttempt', () => {
  it('does not finish before endsAt', async () => {
    const finishIfExpired = vi.fn(async () => true);
    const refs = expireRefs();
    beginExpireFinishAttempt({
      endsAt: 2000,
      now: 1000,
      deferFinish: false,
      refs,
      clearElapsedDraft: vi.fn(),
      onLocalRoundOver: vi.fn(),
      finishIfExpired,
    });
    expect(finishIfExpired).not.toHaveBeenCalled();
    expect(refs.expiredFailCount.current).toBe(0);
  });

  it('does not clear draft while deferFinish is active', () => {
    const clearElapsedDraft = vi.fn();
    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: true,
      refs: expireRefs({
        draftKeyIndices: { current: [0] },
        lastValidatedDraft: { current: 'слово' },
      }),
      clearElapsedDraft,
      onLocalRoundOver: vi.fn(),
      finishIfExpired: vi.fn(async () => true),
    });
    expect(clearElapsedDraft).not.toHaveBeenCalled();
  });

  it('clears draft when elapsed and invokes finish once', async () => {
    const clearElapsedDraft = vi.fn();
    const finishIfExpired = vi.fn(async () => true);
    const refs = expireRefs({
      draftKeyIndices: { current: [0, 1] },
      lastValidatedDraft: { current: 'слово' },
    });
    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: false,
      refs,
      clearElapsedDraft,
      onLocalRoundOver: vi.fn(),
      finishIfExpired,
    });
    expect(clearElapsedDraft).toHaveBeenCalledOnce();
    expect(finishIfExpired).toHaveBeenCalledOnce();
    expect(refs.finishInFlight.current).toBe(true);
    await vi.waitFor(() => expect(refs.finishInFlight.current).toBe(false));
    expect(refs.finishAttempted.current).toBe(true);
  });

  it('forces local round-over after consecutive failed finishes', async () => {
    const onLocalRoundOver = vi.fn();
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
    });
    await vi.waitFor(() => expect(onLocalRoundOver).toHaveBeenCalledOnce());
    expect(refs.localRoundOverForced.current).toBe(true);
    expect(refs.expiredFailCount.current).toBe(2);
  });

  it('forces local round-over after rejected finish', async () => {
    const onLocalRoundOver = vi.fn();
    const refs = expireRefs({ expiredFailCount: { current: 1 } });
    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: false,
      refs,
      clearElapsedDraft: vi.fn(),
      onLocalRoundOver,
      finishIfExpired: async () => {
        throw new Error('network');
      },
      getNow: () => 2000,
    });
    await vi.waitFor(() => expect(onLocalRoundOver).toHaveBeenCalledOnce());
    expect(refs.localRoundOverForced.current).toBe(true);
    expect(refs.expiredFailCount.current).toBe(2);
  });

  it('does not force local round-over when defer becomes true before settle', async () => {
    const onLocalRoundOver = vi.fn();
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
      getDeferFinish: () => true,
    });
    await vi.waitFor(() => expect(refs.finishInFlight.current).toBe(false));
    expect(onLocalRoundOver).not.toHaveBeenCalled();
    expect(refs.localRoundOverForced.current).toBe(false);
  });

  it('skips when deferFinish or already in-flight', () => {
    const finishIfExpired = vi.fn(async () => true);
    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: true,
      refs: expireRefs(),
      clearElapsedDraft: vi.fn(),
      onLocalRoundOver: vi.fn(),
      finishIfExpired,
    });
    expect(finishIfExpired).not.toHaveBeenCalled();

    beginExpireFinishAttempt({
      endsAt: 1000,
      now: 2000,
      deferFinish: false,
      refs: expireRefs({ finishInFlight: { current: true } }),
      clearElapsedDraft: vi.fn(),
      onLocalRoundOver: vi.fn(),
      finishIfExpired,
    });
    expect(finishIfExpired).not.toHaveBeenCalled();
  });
});

describe('shouldClearPlayLocalWordsOnRoundChange', () => {
  it('clears when baseWordRound advances', () => {
    expect(shouldClearPlayLocalWordsOnRoundChange(0, 1)).toBe(true);
    expect(shouldClearPlayLocalWordsOnRoundChange(1, 2)).toBe(true);
  });

  it('does not clear on first paint or same round', () => {
    expect(shouldClearPlayLocalWordsOnRoundChange(null, 0)).toBe(false);
    expect(shouldClearPlayLocalWordsOnRoundChange(1, 1)).toBe(false);
    expect(shouldClearPlayLocalWordsOnRoundChange(1, null)).toBe(false);
  });
});

describe('shouldBlockWordSubmitWhenTimerElapsed', () => {
  it('blocks when round ended or remaining is zero', () => {
    expect(shouldBlockWordSubmitWhenTimerElapsed({ remainingMs: 0, roundEnded: false })).toBe(true);
    expect(shouldBlockWordSubmitWhenTimerElapsed({ remainingMs: 1000, roundEnded: true })).toBe(
      true,
    );
  });

  it('allows submit while time remains and round is live', () => {
    expect(shouldBlockWordSubmitWhenTimerElapsed({ remainingMs: 1, roundEnded: false })).toBe(
      false,
    );
  });
});

describe('shouldLocalRoundOverAfterFailedExpires', () => {
  it('forces local round-over after enough failed finish attempts past timerEndsAt', () => {
    expect(
      shouldLocalRoundOverAfterFailedExpires({
        timerEndsAt: 1000,
        now: 2000,
        consecutiveFailedFinishAttempts: 2,
        deferFinish: false,
        localRoundOverForced: false,
      }),
    ).toBe(true);
  });

  it('does not force while deferring, unsettled clock, or already forced locally', () => {
    expect(
      shouldLocalRoundOverAfterFailedExpires({
        timerEndsAt: 1000,
        now: 2000,
        consecutiveFailedFinishAttempts: 5,
        deferFinish: true,
        localRoundOverForced: false,
      }),
    ).toBe(false);
    expect(
      shouldLocalRoundOverAfterFailedExpires({
        timerEndsAt: 3000,
        now: 2000,
        consecutiveFailedFinishAttempts: 5,
        deferFinish: false,
        localRoundOverForced: false,
      }),
    ).toBe(false);
    expect(
      shouldLocalRoundOverAfterFailedExpires({
        timerEndsAt: 1000,
        now: 2000,
        consecutiveFailedFinishAttempts: 5,
        deferFinish: false,
        localRoundOverForced: true,
      }),
    ).toBe(false);
    expect(
      shouldLocalRoundOverAfterFailedExpires({
        timerEndsAt: 1000,
        now: 2000,
        consecutiveFailedFinishAttempts: 1,
        deferFinish: false,
        localRoundOverForced: false,
      }),
    ).toBe(false);
  });
});

describe('canOpenOnlineResults', () => {
  it('only allows finished sessions', () => {
    expect(canOpenOnlineResults('finished')).toBe(true);
    expect(canOpenOnlineResults('playing')).toBe(false);
    expect(canOpenOnlineResults('waiting')).toBe(false);
    expect(canOpenOnlineResults(undefined)).toBe(false);
  });
});

describe('rosterPlayerIdsKey', () => {
  it('is order-independent for the same uid set', () => {
    expect(rosterPlayerIdsKey(['a', 'b'])).toBe(rosterPlayerIdsKey(['b', 'a']));
    expect(rosterPlayerIdsKey(['a', 'b'])).not.toBe(rosterPlayerIdsKey(['a', 'c']));
  });
});
