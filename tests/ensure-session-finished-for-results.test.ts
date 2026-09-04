import { beforeEach, describe, expect, it, vi } from 'vitest';

const readGameSessionEnsureFields = vi.fn();
const finishGameSessionIfExpired = vi.fn();

vi.mock('../lib/firebase/game-session-service.js', () => ({
  readGameSessionEnsureFields: (...args: unknown[]) => readGameSessionEnsureFields(...args),
  finishGameSessionIfExpired: (...args: unknown[]) => finishGameSessionIfExpired(...args),
}));

import {
  classifyEnsureSessionSnapshot,
  ensureSessionFinishedForResults,
  isResultsFinishBlockedByRematch,
} from '../lib/online/ensure-session-finished-for-results.js';

describe('isResultsFinishBlockedByRematch', () => {
  it('blocks waiting and later playing rounds', () => {
    expect(isResultsFinishBlockedByRematch({ status: 'waiting' })).toBe(true);
    expect(
      isResultsFinishBlockedByRematch({
        status: 'playing',
        baseWordRound: 2,
        expectedBaseWordRound: 1,
      }),
    ).toBe(true);
  });

  it('allows same-round playing and finished', () => {
    expect(
      isResultsFinishBlockedByRematch({
        status: 'playing',
        baseWordRound: 1,
        expectedBaseWordRound: 1,
      }),
    ).toBe(false);
    expect(isResultsFinishBlockedByRematch({ status: 'finished' })).toBe(false);
  });
});

describe('classifyEnsureSessionSnapshot', () => {
  it('treats finished later round as rematch_advanced', () => {
    expect(
      classifyEnsureSessionSnapshot({
        status: 'finished',
        baseWordRound: 2,
        expectedBaseWordRound: 1,
      }),
    ).toBe('rematch_advanced');
  });

  it('treats finished expected round as finished', () => {
    expect(
      classifyEnsureSessionSnapshot({
        status: 'finished',
        baseWordRound: 1,
        expectedBaseWordRound: 1,
      }),
    ).toBe('finished');
  });

  it('continues when still playing the expected round (finish grace / late finish)', () => {
    // Must NOT be rematch_advanced — local time-up + FINISH_WORD_SUBMIT_GRACE
    // leaves RTDB playing while UI already shows results CTA.
    expect(
      classifyEnsureSessionSnapshot({
        status: 'playing',
        baseWordRound: 0,
        expectedBaseWordRound: 0,
      }),
    ).toBe('continue');
  });
});

describe('ensureSessionFinishedForResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns finished from hintSession without leaf reads', async () => {
    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        expectedBaseWordRound: 1,
        hintSession: { status: 'finished', baseWordRound: 1 } as never,
      }),
    ).resolves.toBe('finished');
    expect(readGameSessionEnsureFields).not.toHaveBeenCalled();
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('returns finished immediately when session is already finished', async () => {
    readGameSessionEnsureFields.mockResolvedValue({ status: 'finished', baseWordRound: 1 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', { expectedBaseWordRound: 1 }),
    ).resolves.toBe('finished');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('retries finish then succeeds when status becomes finished', async () => {
    readGameSessionEnsureFields
      .mockResolvedValueOnce({ status: 'playing', baseWordRound: 1 })
      .mockResolvedValueOnce({ status: 'playing', baseWordRound: 1 })
      .mockResolvedValueOnce({ status: 'finished', baseWordRound: 1 });
    finishGameSessionIfExpired.mockResolvedValue(false);

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 3,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('finished');
    expect(finishGameSessionIfExpired).toHaveBeenCalled();
  });

  it('passes hintSession into finishGameSessionIfExpired', async () => {
    const hint = { status: 'playing', baseWordRound: 1 } as never;
    readGameSessionEnsureFields
      .mockResolvedValueOnce({ status: 'playing', baseWordRound: 1 })
      .mockResolvedValueOnce({ status: 'finished', baseWordRound: 1 });
    finishGameSessionIfExpired.mockResolvedValue(true);

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 1,
        delayMs: 0,
        expectedBaseWordRound: 1,
        hintSession: hint,
      }),
    ).resolves.toBe('finished');
    expect(finishGameSessionIfExpired).toHaveBeenCalledWith('ABCDE', { hintSession: hint });
  });

  it('fail-fasts on waiting without spinning retries', async () => {
    readGameSessionEnsureFields.mockResolvedValue({ status: 'waiting', baseWordRound: 1 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 20,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('fail-fasts when playing advanced past expected round', async () => {
    readGameSessionEnsureFields.mockResolvedValue({ status: 'playing', baseWordRound: 2 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 5,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('fail-fasts when finished advanced past expected round (no finish of N+1)', async () => {
    readGameSessionEnsureFields.mockResolvedValue({ status: 'finished', baseWordRound: 2 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 5,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('returns timeout after exhausting attempts while still playing', async () => {
    readGameSessionEnsureFields.mockResolvedValue({ status: 'playing', baseWordRound: 1 });
    finishGameSessionIfExpired.mockResolvedValue(false);

    await expect(
      ensureSessionFinishedForResults('ABCDE', {
        attempts: 2,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('timeout');
    expect(finishGameSessionIfExpired).toHaveBeenCalledTimes(2);
  });
});
