import { canonicalForm, normalizeUk, toDisplayUpper } from './normalize.js';

/**
 * Sorted main dictionary with normalization map for lookup and display.
 */
export class DictionaryIndex {
  private readonly words: string[];
  private readonly normalization: Map<string, string>;

  /**
   * @param words - Sorted normalized entries from `dictionary.txt`.
   * @param normalization - Apostrophe/canonical overrides from `normalization.json`.
   */
  constructor(words: string[], normalization: Record<string, string>) {
    this.words = words;
    this.normalization = new Map(Object.entries(normalization));
  }

  /**
   * Return whether a normalized word exists in the main dictionary.
   */
  hasWord(input: string): boolean {
    return this.binarySearch(normalizeUk(input)) >= 0;
  }

  /**
   * Return lowercase canonical surface form, or `null` if not in the dictionary.
   */
  lookupDisplay(input: string): string | null {
    const normalized = normalizeUk(input);
    if (!this.hasWord(normalized)) {
      return null;
    }
    return canonicalForm(normalized, this.normalization);
  }

  /**
   * Return uppercase canonical form for UI (autocomplete, word list, etc.).
   */
  lookupDisplayUpper(input: string): string | null {
    const canonical = this.lookupDisplay(input);
    return canonical ? toDisplayUpper(canonical) : null;
  }

  /**
   * Binary search index of `target` in the sorted word list, or `-1`.
   */
  private binarySearch(target: string): number {
    let lo = 0;
    let hi = this.words.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = this.words[mid];
      if (value === undefined) {
        break;
      }
      const cmp = target.localeCompare(value, 'uk');
      if (cmp === 0) {
        return mid;
      }
      if (cmp > 0) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    return -1;
  }
}

/** Normalized base-word key (≥8 letters) for autocomplete and ↺ shuffle. */
export type BaseWord = string;

/**
 * Parse a newline-delimited word list file body.
 */
export function parseWordList(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Build a dictionary index from in-memory bundle contents (Node or Expo).
 */
export function createDictionaryIndex(
  dictionaryText: string,
  normalization: string | Record<string, string>,
): DictionaryIndex {
  const words = parseWordList(dictionaryText);
  const normalizationMap =
    typeof normalization === 'string'
      ? (JSON.parse(normalization) as Record<string, string>)
      : normalization;
  return new DictionaryIndex(words, normalizationMap);
}

/**
 * Parse base words list file body.
 */
export function parseBaseWords(content: string): BaseWord[] {
  return parseWordList(content);
}
