import { spacing } from '../../constants/theme.js';
import { normalizeUk, toDisplayUpper } from '../dictionary/normalize.js';

export const LETTER_KEYBOARD_COLUMNS = 6;
/** Horizontal padding on play screen (matches `play.tsx` container). */
export const LETTER_KEYBOARD_HORIZONTAL_PADDING = spacing.md * 2;

/**
 * Square key size for letter keyboard and compose action buttons.
 */
export function computeLetterKeySize(screenWidth: number): number {
  return Math.floor(
    (screenWidth -
      LETTER_KEYBOARD_HORIZONTAL_PADDING -
      spacing.xs * (LETTER_KEYBOARD_COLUMNS - 1)) /
      LETTER_KEYBOARD_COLUMNS,
  );
}

/** One pressable key on the interactive letter keyboard. */
export interface LetterKey {
  id: string;
  label: string;
  /** Normalized character added to the draft when pressed (empty for apostrophe key). */
  value: string;
}

/**
 * Build keyboard keys from the base word display form (one key per letter/apostrophe).
 */
export function buildLetterKeys(baseWordDisplay: string): LetterKey[] {
  const upper = toDisplayUpper(baseWordDisplay);
  const keys: LetterKey[] = [];

  for (let index = 0; index < upper.length; index += 1) {
    const char = upper[index];
    if (char === undefined) {
      continue;
    }
    if (/[''ʼ`]/.test(char)) {
      keys.push({ id: `${index}-'`, label: "'", value: '' });
      continue;
    }
    keys.push({ id: `${index}-${char}`, label: char, value: normalizeUk(char) });
  }

  return keys;
}

/**
 * Return whether the draft can still use the key at `keyIndex` (multiset from base word).
 */
export function isLetterKeyAvailable(
  keys: readonly LetterKey[],
  keyIndex: number,
  draftNormalized: string,
): boolean {
  const key = keys[keyIndex];
  if (key === undefined) {
    return false;
  }

  const baseCounts = countChars(keys.map((item) => item.value).filter(Boolean));
  const draftCounts = countChars([...draftNormalized]);

  if (key.value === '') {
    return true;
  }

  const used = draftCounts.get(key.value) ?? 0;
  const available = baseCounts.get(key.value) ?? 0;
  return used < available;
}

function countChars(chars: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const char of chars) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return counts;
}
