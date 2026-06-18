import { letterCount, normalizeUk } from './normalize.js';

/**
 * Build a letter multiset from a base word (normalized, apostrophes stripped).
 */
export function buildLetterMultiset(baseWord: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of normalizeUk(baseWord)) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}

/**
 * Return whether `word` can be spelled using letters from `baseMultiset` only.
 */
export function canSpellWord(word: string, baseMultiset: Map<string, number>): boolean {
  const used = new Map<string, number>();
  for (const char of normalizeUk(word)) {
    const available = baseMultiset.get(char) ?? 0;
    const need = (used.get(char) ?? 0) + 1;
    if (need > available) {
      return false;
    }
    used.set(char, need);
  }
  return true;
}

/** Validation failure codes returned by {@link validateWord}. */
export type ValidationErrorCode =
  | 'TOO_SHORT'
  | 'IS_BASE_WORD'
  | 'INVALID_LETTERS'
  | 'NOT_IN_DICTIONARY';

/** Optional rules applied during word validation. */
export interface ValidateWordOptions {
  minWordLength?: number;
  allowProperNouns?: boolean;
}

/** External dictionary lookup injected into {@link validateWord}. */
export interface ValidateWordDeps {
  hasInDictionary: (word: string) => boolean;
}

/** Outcome of validating a single played word. */
export interface ValidateWordResult {
  valid: boolean;
  normalized: string;
  error?: ValidationErrorCode;
}

/**
 * Validate a played word against the base word and dictionary.
 */
export function validateWord(
  input: string,
  baseWord: string,
  deps: ValidateWordDeps,
  options: ValidateWordOptions = {},
): ValidateWordResult {
  const minWordLength = options.minWordLength ?? 2;
  const normalized = normalizeUk(input);
  const baseNormalized = normalizeUk(baseWord);

  if (letterCount(normalized) < minWordLength) {
    return { valid: false, normalized, error: 'TOO_SHORT' };
  }

  if (normalized === baseNormalized) {
    return { valid: false, normalized, error: 'IS_BASE_WORD' };
  }

  const baseMultiset = buildLetterMultiset(baseWord);
  if (!canSpellWord(normalized, baseMultiset)) {
    return { valid: false, normalized, error: 'INVALID_LETTERS' };
  }

  if (!deps.hasInDictionary(normalized)) {
    return { valid: false, normalized, error: 'NOT_IN_DICTIONARY' };
  }

  return { valid: true, normalized };
}
