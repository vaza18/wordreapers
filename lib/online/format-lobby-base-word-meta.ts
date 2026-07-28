const META_SEP = ' · ';

/** One secondary line under the lobby base word: round + chooser. */
export function formatLobbyBaseWordMetaLine(input: {
  roundLabel?: string | null;
  chosenByLabel: string;
}): string {
  const round = input.roundLabel?.trim() || '';
  const chosen = input.chosenByLabel.trim();
  if (!round) {
    return chosen;
  }
  if (!chosen) {
    return round;
  }
  return `${round}${META_SEP}${chosen}`;
}
