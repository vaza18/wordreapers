/**
 * Results «Головна» wiring (NLD7S family).
 *
 * Paths that may still have rematch `waiting` / playing membership must run
 * {@link exitOnlineToHome} (screen `handleHome`) — never navigate-only
 * `router.replace('/')`, which skips leave/hasLeft and resurrects joiners.
 *
 * Room-not-found (no live membership) may navigate-only.
 */

export type ResultsHomeEscapePath =
  | 'maps-retry'
  | 'rematch-home'
  /** Finished bootstrap wait or rematch-survival words-loading (no viewData yet). */
  | 'words-loading'
  | 'room-not-found'
  | 'footer';

/** Whether this Results Home path must call exitOnlineToHome. */
export function resultsHomeRequiresExitOnline(path: ResultsHomeEscapePath): boolean {
  return path !== 'room-not-found';
}

/**
 * Words-loading spinner (finished or rematch-survival) with no painted viewData
 * must show Home — do not wait for mapsUnavailable (~30s hung-cap / seed budget).
 * Does **not** paint provisional/incomplete as final (no bootstrap time-escape).
 */
export function shouldShowResultsWordsLoadingHomeEscape(options: {
  hasFinishedViewData: boolean;
}): boolean {
  return !options.hasFinishedViewData;
}

/**
 * Build Home onPress for Results fallback / loading CTAs.
 * Keeps membership leave on maps-retry / rematch-home / words-loading / footer.
 */
export function createResultsHomePress(options: {
  path: ResultsHomeEscapePath;
  exitOnlineHome: () => void;
  navigateHomeOnly: () => void;
}): () => void {
  if (resultsHomeRequiresExitOnline(options.path)) {
    return () => {
      options.exitOnlineHome();
    };
  }
  return () => {
    options.navigateHomeOnly();
  };
}
