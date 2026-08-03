/**
 * When the live round identity advances, clear local word UI so the list cannot
 * stay on the previous round while the keyboard already shows the new baseWord.
 * Callers must also `setWordMaps(null)` so the play empty-clear guard cannot keep
 * prior-round maps for overlap/x2 merge.
 */
export function shouldClearPlayLocalWordsOnRoundChange(
  previousBaseWordRound: number | null,
  nextBaseWordRound: number | null,
): boolean {
  if (nextBaseWordRound == null) {
    return false;
  }
  if (previousBaseWordRound == null) {
    return false;
  }
  return previousBaseWordRound !== nextBaseWordRound;
}
