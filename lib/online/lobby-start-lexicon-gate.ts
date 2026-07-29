/**
 * Lobby playable-word count is a hint only — Start must not stay disabled after a
 * stuck prefetch (network blip / pause) while a prior lexicon is still on screen.
 */
export function shouldDisableLobbyStartForLexicon(
  lexiconLoading: boolean,
  hasLexicon: boolean,
): boolean {
  return lexiconLoading && !hasLexicon;
}
