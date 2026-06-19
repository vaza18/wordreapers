import { spacing } from '../../constants/theme.js';
import { normalizeUk, toDisplayUpper } from '../dictionary/normalize.js';

export const LETTER_KEYBOARD_COLUMNS = 6;
/** Horizontal padding on play screen (matches `play.tsx` container). */
export const LETTER_KEYBOARD_HORIZONTAL_PADDING = spacing.md * 2;
/** Cap letter/compose key size on wide screens (~laptop keycap). */
export const LETTER_KEY_MAX_SIZE = 48;
/** Apply the cap from this width (phones keep the 6-column layout). */
export const LETTER_KEY_TABLET_MIN_WIDTH = 600;

/**
 * Square key size for letter keyboard and compose action buttons.
 */
export function computeLetterKeySize(screenWidth: number): number {
  const gap = spacing.xs;
  const available = screenWidth - LETTER_KEYBOARD_HORIZONTAL_PADDING;
  const uncapped = Math.floor(
    (available - gap * (LETTER_KEYBOARD_COLUMNS - 1)) / LETTER_KEYBOARD_COLUMNS,
  );
  if (screenWidth < LETTER_KEY_TABLET_MIN_WIDTH) {
    return uncapped;
  }
  return Math.min(LETTER_KEY_MAX_SIZE, uncapped);
}

/** One pressable key on the interactive letter keyboard. */
export interface LetterKey {
  id: string;
  label: string;
  /** Character appended to the draft when pressed. */
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
      keys.push({ id: `${index}-'`, label: "'", value: char });
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

  if (/[''ʼ`]/.test(key.value)) {
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
