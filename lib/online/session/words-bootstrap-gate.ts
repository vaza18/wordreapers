/**
 * When the roster words effect cannot start a fetch, bootstrap must still
 * complete so results UI does not spin forever after a cancelled prior fetch.
 */
export function shouldCompleteWordsBootstrapWithoutFetch(options: {
  enabled: boolean;
  hasGameId: boolean;
  rosterLength: number;
}): boolean {
  return !options.enabled || !options.hasGameId || options.rosterLength === 0;
}
