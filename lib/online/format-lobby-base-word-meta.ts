const META_SEP = ' · ';

/** One secondary line under the lobby base word: lexicon + round + chooser. */
export function formatLobbyBaseWordMetaLine(input: {
  lexiconLabel?: string | null;
  roundLabel?: string | null;
  chosenByLabel: string;
}): string {
  const parts: string[] = [];
  const lexicon = input.lexiconLabel?.trim() || '';
  const round = input.roundLabel?.trim() || '';
  const chosen = input.chosenByLabel.trim();
  if (lexicon) {
    parts.push(lexicon);
  }
  if (round) {
    parts.push(round);
  }
  if (chosen) {
    parts.push(chosen);
  }
  return parts.join(META_SEP);
}
