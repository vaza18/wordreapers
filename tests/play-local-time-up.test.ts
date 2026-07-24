import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  buildLocalTimeUpSessionSnapshot,
  resolveExpectedResultsBaseWordRound,
  shouldHoldPlayRoundKeyDuringLocalTimeUp,
  shouldSkipExpireFinishForPinnedTimeUp,
  shouldWriteFinishedRoundArchiveOnNavigate,
} from '../lib/online/play-local-time-up.js';

describe('resolveExpectedResultsBaseWordRound', () => {
  it('prefers pinned local time-up over live rematch round', () => {
    expect(
      resolveExpectedResultsBaseWordRound({
        pinnedLocalTimeUpRound: 1,
        roundEndSnapshotRound: 1,
        liveBaseWordRound: 2,
      }),
    ).toBe(1);
  });

  it('falls back to snapshot then live', () => {
    expect(
      resolveExpectedResultsBaseWordRound({
        pinnedLocalTimeUpRound: null,
        roundEndSnapshotRound: 0,
        liveBaseWordRound: 2,
      }),
    ).toBe(0);
    expect(
      resolveExpectedResultsBaseWordRound({
        pinnedLocalTimeUpRound: null,
        roundEndSnapshotRound: null,
        liveBaseWordRound: 3,
      }),
    ).toBe(3);
  });
});

describe('shouldHoldPlayRoundKeyDuringLocalTimeUp', () => {
  it('holds when pending time-up and live rematch advanced', () => {
    expect(
      shouldHoldPlayRoundKeyDuringLocalTimeUp({
        liveBaseWordRound: 2,
        pinnedTimeUpRound: 1,
        roundOverPendingResults: true,
      }),
    ).toBe(true);
  });

  it('does not hold without pending time-up or when rounds match', () => {
    expect(
      shouldHoldPlayRoundKeyDuringLocalTimeUp({
        liveBaseWordRound: 2,
        pinnedTimeUpRound: 1,
        roundOverPendingResults: false,
      }),
    ).toBe(false);
    expect(
      shouldHoldPlayRoundKeyDuringLocalTimeUp({
        liveBaseWordRound: 1,
        pinnedTimeUpRound: 1,
        roundOverPendingResults: true,
      }),
    ).toBe(false);
  });
});

describe('shouldSkipExpireFinishForPinnedTimeUp', () => {
  it('skips when time-up pending and live rematch playing advanced', () => {
    expect(
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults: true,
        pinnedTimeUpRound: 1,
        liveStatus: 'playing',
        liveBaseWordRound: 2,
      }),
    ).toBe(true);
  });

  it('skips after natural finish pin (not only localRoundOverForced)', () => {
    // RTDB finished → pin + pending, then peer rematch to playing N+1.
    expect(
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults: true,
        pinnedTimeUpRound: 0,
        liveStatus: 'playing',
        liveBaseWordRound: 1,
      }),
    ).toBe(true);
  });

  it('skips when live left playing (waiting/finished)', () => {
    expect(
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults: true,
        pinnedTimeUpRound: 1,
        liveStatus: 'waiting',
        liveBaseWordRound: 1,
      }),
    ).toBe(true);
  });

  it('does not skip while still on the pinned playing round', () => {
    expect(
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults: true,
        pinnedTimeUpRound: 1,
        liveStatus: 'playing',
        liveBaseWordRound: 1,
      }),
    ).toBe(false);
  });

  it('does not skip without pending time-up', () => {
    expect(
      shouldSkipExpireFinishForPinnedTimeUp({
        roundOverPendingResults: false,
        pinnedTimeUpRound: 1,
        liveStatus: 'playing',
        liveBaseWordRound: 2,
      }),
    ).toBe(false);
  });
});

describe('shouldWriteFinishedRoundArchiveOnNavigate', () => {
  it('writes only live finished for the expected round', () => {
    expect(
      shouldWriteFinishedRoundArchiveOnNavigate({
        ensureOutcome: 'finished',
        liveStatus: 'finished',
        liveBaseWordRound: 1,
        expectedBaseWordRound: 1,
      }),
    ).toBe(true);
  });

  it('skips archive on rematch_advanced or waiting/playing live', () => {
    expect(
      shouldWriteFinishedRoundArchiveOnNavigate({
        ensureOutcome: 'rematch_advanced',
        liveStatus: 'waiting',
        liveBaseWordRound: 1,
        expectedBaseWordRound: 1,
      }),
    ).toBe(false);
    expect(
      shouldWriteFinishedRoundArchiveOnNavigate({
        ensureOutcome: 'already_finished',
        liveStatus: 'playing',
        liveBaseWordRound: 2,
        expectedBaseWordRound: 1,
      }),
    ).toBe(false);
  });

  it('skips when live finished a later round', () => {
    expect(
      shouldWriteFinishedRoundArchiveOnNavigate({
        ensureOutcome: 'finished',
        liveStatus: 'finished',
        liveBaseWordRound: 2,
        expectedBaseWordRound: 1,
      }),
    ).toBe(false);
  });
});

describe('buildLocalTimeUpSessionSnapshot', () => {
  it('freezes playing session as finished for the same baseWordRound', () => {
    const live = {
      status: 'playing',
      baseWordRound: 1,
      baseWord: 'тест',
      players: {},
    } as GameSession;
    const snap = buildLocalTimeUpSessionSnapshot(live, 'ABCDE');
    expect(snap.status).toBe('finished');
    expect(snap.baseWordRound).toBe(1);
    expect(snap.id).toBe('ABCDE');
  });
});
