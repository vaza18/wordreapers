import type { GameSession } from '../firebase/types.js';

import { shouldKeepFrozenResultsOverLiveFinished } from './should-keep-frozen-results-over-live-finished.js';

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
