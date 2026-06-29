/**
 * Keep showing a frozen earlier round while a later round finishes in RTDB.
 * Players still reviewing results must not be switched to a round they skipped.
 */
export function shouldKeepFrozenResultsOverLiveFinished(
  frozenBaseWordRound: number,
  liveBaseWordRound: number,
): boolean {
  return frozenBaseWordRound < liveBaseWordRound;
}
