import type { GameSession } from '../../firebase/types.js';

import type { AllPlayerWords } from './clone-player-words.js';
import { isSessionWordsSnapshotReady } from './session-words-bootstrap.js';

/**
 * Keep the results spinner until words match session counts, or a frozen archive is ready.
 * Avoids «0 слів» with a non-zero winner line when rematch cleared RTDB / denied reads.
 */
export function shouldShowOnlineResultsWordsLoading(options: {
  frozenRound: object | null | undefined;
  session: Pick<GameSession, 'status' | 'players'> | null | undefined;
  wordsSnapshot: AllPlayerWords;
  wordsBootstrapComplete: boolean;
}): boolean {
  if (options.frozenRound) {
    return false;
  }
  if (!options.wordsBootstrapComplete) {
    return true;
  }
  const session = options.session;
  if (!session || session.status !== 'finished') {
    return false;
  }
  return !isSessionWordsSnapshotReady(session, options.wordsSnapshot);
}
