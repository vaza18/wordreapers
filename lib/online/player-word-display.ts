import { toDisplayUpper } from '../dictionary/normalize.js';

type DisplaysSource = ReadonlyMap<string, string> | Readonly<Record<string, string>> | undefined;

function lookupDisplay(normalized: string, displays: DisplaysSource): string | undefined {
  if (!displays) {
    return undefined;
  }
  if (displays instanceof Map) {
    return displays.get(normalized);
  }
  const value = (displays as Readonly<Record<string, string>>)[normalized];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Surface label for a submitted normalized word.
 * Prefer round/archive lexicon displays; else uppercase the normalized key.
 */
export function resolvePlayerWordDisplay(normalized: string, displays?: DisplaysSource): string {
  return lookupDisplay(normalized, displays) ?? toDisplayUpper(normalized);
}
