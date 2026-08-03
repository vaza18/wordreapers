import type { GameSession } from '../../firebase/types.js';

import { shouldSkipEmptyArchiveWords } from './archive-words-gate.js';
import type { AllPlayerWords } from './clone-player-words.js';

/** After this, empty+claims stops blocking results (show empty rather than spin forever). */
export const RESULTS_EMPTY_CLAIMS_ESCAPE_MS = 8_000;

/**
 * Bound for maps bootstrap when fetch fails and listener stays silent.
 * Escapes the **spinner** only — does not mark maps authoritative or freeze empty.
 */
export const RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS = 8_000;

/**
 * Keep the results spinner until maps bootstrap completes (or a frozen archive
 * is ready), with a controlled escape so PD/network cannot hang forever.
 *
 * Bootstrap escape stops the spinner without treating the wait as authoritative
 * empty: `wordsBootstrapComplete` stays false → freeze still waits for a real
 * snapshot/fetch (or rich pending). Late maps can still freeze/upgrade.
 *
 * After bootstrap, keep spinning when invert is empty but live maps still claim
 * words — unless `emptyClaimsLoadingSinceMs` has exceeded
 * {@link RESULTS_EMPTY_CLAIMS_ESCAPE_MS}.
 */
export function shouldShowOnlineResultsWordsLoading(options: {
  frozenRound: object | null | undefined;
  wordsBootstrapComplete: boolean;
  session?: Pick<GameSession, 'status' | 'wordPlayers'> | null;
  wordsSnapshot?: AllPlayerWords;
  /** Wall-clock ms when empty+claims loading began; null/omit = no escape yet. */
  emptyClaimsLoadingSinceMs?: number | null;
  /** Wall-clock ms when results words loading began (bootstrap gate). */
  bootstrapLoadingSinceMs?: number | null;
  nowMs?: number;
}): boolean {
  if (options.frozenRound) {
    return false;
  }
  if (!options.wordsBootstrapComplete) {
    const since = options.bootstrapLoadingSinceMs;
    const now = options.nowMs ?? Date.now();
    if (typeof since === 'number' && now - since >= RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS) {
      return false;
    }
    return true;
  }
  const session = options.session;
  const words = options.wordsSnapshot;
  if (
    session?.status === 'finished' &&
    words != null &&
    shouldSkipEmptyArchiveWords(session, words)
  ) {
    const since = options.emptyClaimsLoadingSinceMs;
    const now = options.nowMs ?? Date.now();
    if (typeof since === 'number' && now - since >= RESULTS_EMPTY_CLAIMS_ESCAPE_MS) {
      return false;
    }
    return true;
  }
  return false;
}
