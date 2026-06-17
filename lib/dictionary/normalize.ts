/**
 * Ukrainian text normalization and display helpers.
 */

/**
 * Strip apostrophes and normalize for dictionary lookup (Ukrainian).
 */
export function normalizeUk(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[''ʼ`]/g, '');
}

/**
 * Count letters excluding apostrophes (for min length / base word size).
 */
export function letterCount(word: string): number {
  return word.replace(/[''ʼ`]/g, '').length;
}

/**
 * Uppercase a word for on-screen display (`uk-UA` locale).
 */
export function toDisplayUpper(word: string): string {
  return word.toLocaleUpperCase('uk-UA');
}

/**
 * Canonical surface form (apostrophes etc.) from a normalized key.
 */
export function canonicalForm(
  normalized: string,
  normalization: ReadonlyMap<string, string> | Record<string, string>,
): string {
  const map: ReadonlyMap<string, string> =
    normalization instanceof Map ? normalization : new Map(Object.entries(normalization));
  const canonical = map.get(normalized);
  return typeof canonical === 'string' ? canonical : normalized;
}

/**
 * Uppercase label for UI — use instead of storing `display` in dictionary files.
 */
export function displayForm(
  normalized: string,
  normalization: ReadonlyMap<string, string> | Record<string, string>,
): string {
  return toDisplayUpper(canonicalForm(normalized, normalization));
}
