import type { GameSession } from '../../firebase/types.js';

/**
 * Frozen-round viewing helpers for play/results when live RTDB advances ahead of the viewer.
 */

// INVARIANT (see docs/known-issues.md — 2026-06 Frozen round results overwritten): frozenBaseWordRound < liveBaseWordRound → keep frozen UI.
/** Keep showing a frozen earlier round while a later round finishes in RTDB. */
export function shouldKeepFrozenResultsOverLiveFinished(
  frozenBaseWordRound: number,
  liveBaseWordRound: number,
): boolean {
  return frozenBaseWordRound < liveBaseWordRound;
}

/** Whether results may freeze the live RTDB `finished` session on first paint. */
export function shouldFreezeLiveFinishedOnResults(
  liveBaseWordRound: number,
  viewingBaseWordRound: number | null | undefined,
): boolean {
  if (viewingBaseWordRound == null) {
    return true;
  }
  return viewingBaseWordRound >= liveBaseWordRound;
}

export type RecoverFinishedRoundFromArchiveOptions = {
  /**
   * Join/rejoin landed on results while live is still `playing` (no pinned viewing round).
   * Do not hydrate a prior finished archive — that shows «all words» for an old round.
   */
  fromJoinIntoPlaying?: boolean;
};

/** Load archived finished round when live RTDB no longer reflects the viewed round. */
export function shouldRecoverFinishedRoundFromArchive(
  liveSession: GameSession | null | undefined,
  options?: RecoverFinishedRoundFromArchiveOptions,
): boolean {
  if (!liveSession) {
    return true;
  }
  if (options?.fromJoinIntoPlaying === true && liveSession.status === 'playing') {
    return false;
  }
  return liveSession.status === 'waiting' || liveSession.status === 'playing';
}

/** True when results should hydrate from a pinned local archive instead of live RTDB. */
export function shouldLoadViewingRoundFromArchive(
  viewingBaseWordRound: number | null,
  liveSession: GameSession | null | undefined,
): viewingBaseWordRound is number {
  if (viewingBaseWordRound == null) {
    return false;
  }
  if (!liveSession) {
    return true;
  }
  if (liveSession.status === 'waiting' || liveSession.status === 'playing') {
    return true;
  }
  if (liveSession.status === 'finished') {
    // Prefer the archive written on navigate-to-results. Rematch clears `player_words`
    // (and may flip to `waiting`) so live subscribe often hits permission_denied / empty.
    return true;
  }
  return false;
}
