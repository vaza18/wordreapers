/**
 * Whether results may freeze the live RTDB `finished` session on first paint.
 * When the player is reviewing an earlier round, live data belongs to a later round.
 */
export function shouldFreezeLiveFinishedOnResults(
  liveBaseWordRound: number,
  viewingBaseWordRound: number | null | undefined,
): boolean {
  if (viewingBaseWordRound == null) {
    return true;
  }
  return viewingBaseWordRound >= liveBaseWordRound;
}
