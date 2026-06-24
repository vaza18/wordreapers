import { normalizeUk } from '../../dictionary/normalize.js';

function hasWordInSortedList(words: readonly string[], normalized: string): boolean {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = words[mid];
    if (value === undefined) {
      break;
    }
    const cmp = normalized.localeCompare(value, 'uk');
    if (cmp === 0) {
      return true;
    }
    if (cmp > 0) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return false;
}

/**
 * Return whether a normalized base word is in the safe public whitelist (`base_words.txt`).
 */
export function isPublicBaseWordSafe(normalized: string, baseWords: readonly string[]): boolean {
  if (!normalized) {
    return false;
  }
  return hasWordInSortedList(baseWords, normalized);
}

/**
 * Validate display/base word from session before publishing public.
 */
export function isPublicBaseWordSafeFromDisplay(
  baseWord: string,
  baseWords: readonly string[],
): boolean {
  const normalized = normalizeUk(baseWord);
  return isPublicBaseWordSafe(normalized, baseWords);
}
