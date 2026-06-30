import type { GameSession } from '../firebase/types.js';

/**
 * Frozen-round viewing helpers for play/results when live RTDB advances ahead of the viewer.
 */

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

/** Load archived finished round when live RTDB no longer reflects the viewed round. */
export function shouldRecoverFinishedRoundFromArchive(
  liveSession: GameSession | null | undefined,
): boolean {
  if (!liveSession) {
    return true;
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
    return shouldKeepFrozenResultsOverLiveFinished(
      viewingBaseWordRound,
      liveSession.baseWordRound ?? 0,
    );
  }
  return false;
}
