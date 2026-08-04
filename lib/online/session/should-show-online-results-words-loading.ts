import type { GameSession } from '../../firebase/types.js';

import { shouldSkipEmptyArchiveWords } from './archive-words-gate.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { totalPlayerWordCount } from './live-words-snapshot.js';

/** After this, empty+claims stops blocking results (show empty rather than spin forever). */
export const RESULTS_EMPTY_CLAIMS_ESCAPE_MS = 8_000;

/**
 * Keep the results spinner until maps bootstrap completes (or a frozen archive
 * is ready). Do **not** time-escape bootstrap (historical 8s escape painted
 * provisional as final — never re-wire). Exit via authoritative complete or
 * `mapsUnavailable` CTA / banner.
 *
 * Fail-loud: pre-paint uses {@link resolveResultsErrorCta} `maps-retry`; post-paint
 * uses an inline banner. When {@link mapsUnavailable}, do **not** spin — same
 * invariant as left `shouldBlockLeftRoundOnMapsBootstrap` (spinner must not mask
 * Retry after `wordsBootstrapComplete` is flipped false while SoT words remain).
 * When {@link wordsSnapshot} already has words, do **not** spin on incomplete
 * bootstrap either (post-paint Retry remount must not flash ActivityIndicator).
 *
 * After bootstrap, keep spinning when invert is empty but live maps still claim
 * words — unless `emptyClaimsLoadingSinceMs` has exceeded
 * {@link RESULTS_EMPTY_CLAIMS_ESCAPE_MS} (empty-claims escape only — not bootstrap).
 */
export function shouldShowOnlineResultsWordsLoading(options: {
  frozenRound: object | null | undefined;
  wordsBootstrapComplete: boolean;
  /** When true, fail-loud CTA/banner owns the UI — never mask with spinner. */
  mapsUnavailable?: boolean;
  session?: Pick<GameSession, 'status' | 'wordPlayers'> | null;
  wordsSnapshot?: AllPlayerWords;
  /** Wall-clock ms when empty+claims loading began; null/omit = no escape yet. */
  emptyClaimsLoadingSinceMs?: number | null;
  nowMs?: number;
}): boolean {
  if (options.frozenRound) {
    return false;
  }
  // Post-bootstrap unavailable flips bootstrap incomplete but keeps SoT words —
  // spinner would hide the banner (C1). Pre-paint maps-retry is handled earlier.
  if (options.mapsUnavailable) {
    return false;
  }
  if (!options.wordsBootstrapComplete) {
    // Post-paint Retry: SoT words still in snapshot while remount restores bootstrap.
    if (options.wordsSnapshot != null && totalPlayerWordCount(options.wordsSnapshot) > 0) {
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
