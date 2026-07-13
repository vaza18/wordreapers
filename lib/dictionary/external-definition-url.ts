/** Third-party Ukrainian dictionary host used for definition lookups. */
export const GOROH_ORIGIN = 'https://goroh.pp.ua';

/** Path segment for definition pages on goroh (Ukrainian “Тлумачення”). */
export const GOROH_DEFINITION_PATH = 'Тлумачення';

/**
 * Build an app-constructed goroh definition URL for a word.
 * Returns null for empty/whitespace-only input. Encodes path segments for Cyrillic.
 */
export function buildUkrainianDefinitionUrl(word: string): string | null {
  const trimmed = word.trim();
  if (!trimmed) {
    return null;
  }

  return `${GOROH_ORIGIN}/${encodeURIComponent(GOROH_DEFINITION_PATH)}/${encodeURIComponent(trimmed)}`;
}
