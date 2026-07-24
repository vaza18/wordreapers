import { beforeEach, describe, expect, it, vi } from 'vitest';

const readGameSessionSnapshot = vi.fn();
const finishGameSessionIfExpired = vi.fn();

vi.mock('../lib/firebase/game-session-service.js', () => ({
  readGameSessionSnapshot: (...args: unknown[]) => readGameSessionSnapshot(...args),
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
});

describe('ensureSessionFinishedForResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns finished immediately when session is already finished', async () => {
    readGameSessionSnapshot.mockResolvedValue({ status: 'finished', baseWordRound: 1 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, { expectedBaseWordRound: 1 }),
    ).resolves.toBe('finished');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('retries finish then succeeds when status becomes finished', async () => {
    readGameSessionSnapshot
      .mockResolvedValueOnce({ status: 'playing', baseWordRound: 1 })
      .mockResolvedValueOnce({ status: 'playing', baseWordRound: 1 })
      .mockResolvedValueOnce({ status: 'finished', baseWordRound: 1 });
    finishGameSessionIfExpired.mockResolvedValue(false);

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, {
        attempts: 3,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('finished');
    expect(finishGameSessionIfExpired).toHaveBeenCalled();
  });

  it('fail-fasts on waiting without spinning retries', async () => {
    readGameSessionSnapshot.mockResolvedValue({ status: 'waiting', baseWordRound: 1 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, {
        attempts: 20,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('fail-fasts when playing advanced past expected round', async () => {
    readGameSessionSnapshot.mockResolvedValue({ status: 'playing', baseWordRound: 2 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, {
        attempts: 5,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('fail-fasts when finished advanced past expected round (no finish of N+1)', async () => {
    readGameSessionSnapshot.mockResolvedValue({ status: 'finished', baseWordRound: 2 });

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, {
        attempts: 5,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('rematch_advanced');
    expect(finishGameSessionIfExpired).not.toHaveBeenCalled();
  });

  it('returns timeout after exhausting attempts while still playing', async () => {
    readGameSessionSnapshot.mockResolvedValue({ status: 'playing', baseWordRound: 1 });
    finishGameSessionIfExpired.mockResolvedValue(false);

    await expect(
      ensureSessionFinishedForResults('ABCDE', undefined, {
        attempts: 2,
        delayMs: 0,
        expectedBaseWordRound: 1,
      }),
    ).resolves.toBe('timeout');
    expect(finishGameSessionIfExpired).toHaveBeenCalledTimes(2);
  });
});
