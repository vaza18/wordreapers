import type { OpenResultsEnsureOutcome } from './ensure-session-finished-for-results.js';
import type { GameSession } from '../firebase/types.js';

/**
 * Local time-up can outlive RTDB `playing` when finish-if-expired fails. Pin the
 * ended round so rematch (`waiting` / later `playing`) cannot rewrite expected
 * results round or adopt a new keyboard/round key under the time-up modal.
 */

export function resolveExpectedResultsBaseWordRound(options: {
  pinnedLocalTimeUpRound: number | null | undefined;
  roundEndSnapshotRound: number | null | undefined;
  liveBaseWordRound: number | null | undefined;
}): number {
  if (options.pinnedLocalTimeUpRound != null) {
    return options.pinnedLocalTimeUpRound;
  }
  if (options.roundEndSnapshotRound != null) {
    return options.roundEndSnapshotRound;
  }
  return options.liveBaseWordRound ?? 0;
}

/** While local time-up pins an older round, ignore live rematch round bumps. */
export function shouldHoldPlayRoundKeyDuringLocalTimeUp(options: {
  liveBaseWordRound: number;
  pinnedTimeUpRound: number | null | undefined;
  roundOverPendingResults: boolean;
}): boolean {
  return (
    options.roundOverPendingResults &&
    options.pinnedTimeUpRound != null &&
    options.liveBaseWordRound > options.pinnedTimeUpRound
  );
}

/**
 * Stop expire/finish ticks once time-up UI pins a round that live rematch has
 * already left (frozen display `timerEndsAt` is in the past and would spam
 * finish on N+1). Covers both forced local time-up and natural RTDB `finished`
 * (which pins without setting `localRoundOverForced`).
 */
export function shouldSkipExpireFinishForPinnedTimeUp(options: {
  roundOverPendingResults: boolean;
  pinnedTimeUpRound: number | null | undefined;
  liveStatus: string | undefined;
  liveBaseWordRound: number | null | undefined;
}): boolean {
  if (!options.roundOverPendingResults || options.pinnedTimeUpRound == null) {
    return false;
  }
  if (options.liveStatus !== 'playing') {
    return true;
  }
  return (options.liveBaseWordRound ?? 0) > options.pinnedTimeUpRound;
}

/**
 * Persist archive only from live RTDB `finished` for the expected round.
 * Never write a local synthetic finished snapshot (forceLocalRoundOver) after rematch.
 */
export function shouldWriteFinishedRoundArchiveOnNavigate(options: {
  ensureOutcome: OpenResultsEnsureOutcome;
  liveStatus: string | undefined;
  liveBaseWordRound: number | null | undefined;
  expectedBaseWordRound: number;
}): boolean {
  if (options.ensureOutcome === 'rematch_advanced' || options.ensureOutcome === 'timeout') {
    return false;
  }
  return (
    options.liveStatus === 'finished' &&
    (options.liveBaseWordRound ?? 0) === options.expectedBaseWordRound
  );
}

/** Freeze a local finished view of the round that just timed out (RTDB may still be playing). */
export function buildLocalTimeUpSessionSnapshot<T extends GameSession>(
  live: T,
  gameId: string,
): T & { id: string; status: 'finished' } {
  return {
    ...live,
    id: gameId,
    status: 'finished',
  };
}
