import { normalizeUk } from '../dictionary/normalize.js';

/** Prefix search over sorted `base_words.txt` keys. */
export interface BaseWordPrefixSearchResult {
  words: string[];
  total: number;
}

/**
 * Return sorted base words whose normalized form starts with `prefix`.
 */
export function searchBaseWordPrefix(
  baseWords: readonly string[],
  prefix: string,
  limit = 8,
): string[] {
  return searchBaseWordPrefixResult(baseWords, prefix, limit).words;
}

/**
 * Prefix search with total match count (for scrollable autocomplete dropdown).
 */
export function searchBaseWordPrefixResult(
  baseWords: readonly string[],
  prefix: string,
  limit = 8,
): BaseWordPrefixSearchResult {
  const needle = normalizeUk(prefix);
  if (!needle) {
    return { words: [], total: 0 };
  }

  const start = lowerBound(baseWords, needle);
  const words: string[] = [];
  let total = 0;

  for (let i = start; i < baseWords.length; i += 1) {
    const word = baseWords[i];
    if (word === undefined || !word.startsWith(needle)) {
      break;
    }
    total += 1;
    if (words.length < limit) {
      words.push(word);
    }
  }

  return { words, total };
}

/**
 * Pick a random base word (for ↺ shuffle).
 */
export function randomBaseWord(baseWords: readonly string[]): string | null {
  if (baseWords.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * baseWords.length);
  return baseWords[index] ?? null;
}

function lowerBound(words: readonly string[], target: string): number {
  let lo = 0;
  let hi = words.length;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const value = words[mid];
    if (value === undefined) {
      break;
    }
    if (value.localeCompare(target, 'uk') < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}
