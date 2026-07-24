/**
 * When the live round identity advances, clear local word UI so the list cannot
 * stay on the previous round while the keyboard already shows the new baseWord.
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
