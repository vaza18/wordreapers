import type { GameSession } from '../firebase/types.js';

import { shouldKeepFrozenResultsOverLiveFinished } from './frozen-round-view.js';

/** Keep a locally frozen finished round when RTDB reports a later round finished. */
export function resolveRoundEndSessionSnapshot<T extends GameSession>(
  previous: T | null,
  live: T,
): T {
  const liveRound = live.baseWordRound ?? 0;
  if (previous !== null && (previous.baseWordRound ?? 0) === liveRound) {
    return previous;
  }
  if (
    previous !== null &&
    shouldKeepFrozenResultsOverLiveFinished(previous.baseWordRound ?? 0, liveRound)
  ) {
    return previous;
  }
  return live;
}
