/**
 * True when the play screen still shows a locally frozen finished round while RTDB
 * has already advanced to a later `baseWordRound` (e.g. another player started rematch).
 */
export function isReviewingPriorRoundOnPlayScreen(
  roundEnded: boolean,
  endedBaseWordRound: number | null | undefined,
  liveBaseWordRound: number | null | undefined,
): boolean {
  if (!roundEnded || endedBaseWordRound == null || liveBaseWordRound == null) {
    return false;
  }
  return endedBaseWordRound < liveBaseWordRound;
}
