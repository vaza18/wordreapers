import type { GameSession } from '../firebase/types.js';

import { shouldSkipEmptyArchiveWords } from './session/archive-words-gate.js';
import type { AllPlayerWords } from './session/clone-player-words.js';

/**
 * Whether results may call `finalizeOnlineRoundForPlayer` for this paint.
 * Prefer a frozen round; allow empty+claims spinner escape only when invert is
 * no longer claimed empty (otherwise zero standings would lock forever).
 */
export function shouldFinalizeOnlineResultsStats(options: {
  frozenRound: object | null | undefined;
  emptyClaimsEscaped: boolean;
  session: Pick<GameSession, 'status' | 'wordPlayers'> | null | undefined;
  wordsSnapshot: AllPlayerWords;
}): boolean {
  const { session, wordsSnapshot, frozenRound, emptyClaimsEscaped } = options;
  if (!session || session.status !== 'finished') {
    return false;
  }
  if (!frozenRound && !emptyClaimsEscaped) {
    return false;
  }
  // Maps/archive still claim words while invert is empty — do not finalize zeros.
  if (shouldSkipEmptyArchiveWords(session, wordsSnapshot)) {
    return false;
  }
  return true;
}
