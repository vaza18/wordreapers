/**
 * When the roster words effect is enabled with an empty roster, bootstrap may
 * complete without a fetch (listen-only).
 *
 * Disabled / missing gameId must NOT mark complete — that left
 * `wordsBootstrapComplete=true` into the first enabled paint and froze empty
 * results before maps arrived (C1).
 */
export function shouldCompleteWordsBootstrapWithoutFetch(options: {
  enabled: boolean;
  hasGameId: boolean;
  rosterLength: number;
}): boolean {
  return options.enabled && options.hasGameId && options.rosterLength === 0;
}
