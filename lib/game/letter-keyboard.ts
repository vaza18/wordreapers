import { spacing } from '../../constants/theme.js';
import { TABLET_LAYOUT_MIN_WIDTH } from '../typography/font-scale.js';
import { normalizeUk, toDisplayUpper } from '../dictionary/normalize.js';

/** Max letter keys per row on phones (tablets use fixed key size + natural wrap). */
export const LETTER_KEYBOARD_PHONE_COLUMNS = 6;
/** @deprecated Use {@link LETTER_KEYBOARD_PHONE_COLUMNS}. */
export const LETTER_KEYBOARD_COLUMNS = LETTER_KEYBOARD_PHONE_COLUMNS;
/** Horizontal padding on play screen (matches play container). */
export const LETTER_KEYBOARD_HORIZONTAL_PADDING = spacing.md * 2;
/** Use laptop-like key sizing from this width (points). */
export const LETTER_KEY_TABLET_MIN_WIDTH = TABLET_LAYOUT_MIN_WIDTH;
/** Target letter-key edge on tablets (~MacBook 1u keycap). */
export const LETTER_KEY_TABLET_MM = 15;

const MM_PER_INCH = 25.4;
/** Baseline logical px per inch (React Native dp). */
const LAYOUT_DP_PER_INCH = 160;

/** Convert millimeters to layout dp (density-independent points). */
export function mmToLayoutDp(mm: number): number {
  return Math.round((mm * LAYOUT_DP_PER_INCH) / MM_PER_INCH);
}

/** Fixed square key size on tablets ({@link LETTER_KEY_TABLET_MM} mm). */
export const LETTER_KEY_TABLET_SIZE = mmToLayoutDp(LETTER_KEY_TABLET_MM);

/**
 * Gap between letter keys — scales with key size (same ratio as the phone reference).
 */
export function computeLetterKeyGap(keySize: number): number {
  const referenceGap = spacing.xs;
  const phoneReferenceKeySize = 56;
  return Math.max(referenceGap, Math.round(keySize * (referenceGap / phoneReferenceKeySize)));
}

/** Options for {@link computeLetterKeySize} and {@link computeLetterKeyLayout}. */
export interface LetterKeyLayoutOptions {
  /** When true, `width` is the inner compose/keyboard width (parent padding already excluded). */
  contentWidth?: boolean;
}

/** Total row width for `columns` square keys and the gaps between them. */
export function letterKeyboardRowWidth(
  keySize: number,
  gap: number,
  columns = LETTER_KEYBOARD_PHONE_COLUMNS,
): number {
  return columns * keySize + (columns - 1) * gap;
}

/**
 * Square key size for letter keyboard and compose action buttons.
 * Phones: fill width with 6 columns. Tablets: ~15 mm keys, more per row via flex wrap.
 *
 * Uses the same scaled gap as the live grid (`computeLetterKeyGap`) so wider phones
 * still fit six keys per row.
 */
export function computeLetterKeySize(width: number, options: LetterKeyLayoutOptions = {}): number {
  const { contentWidth = false } = options;
  const layoutWidth = contentWidth ? width + LETTER_KEYBOARD_HORIZONTAL_PADDING : width;

  if (layoutWidth >= LETTER_KEY_TABLET_MIN_WIDTH) {
    return LETTER_KEY_TABLET_SIZE;
  }

  const available = contentWidth ? width : width - LETTER_KEYBOARD_HORIZONTAL_PADDING;
  if (available <= 0) {
    return 1;
  }

  let keySize = Math.floor(
    (available - spacing.xs * (LETTER_KEYBOARD_PHONE_COLUMNS - 1)) / LETTER_KEYBOARD_PHONE_COLUMNS,
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const gap = computeLetterKeyGap(keySize);
    const next = Math.floor(
      (available - gap * (LETTER_KEYBOARD_PHONE_COLUMNS - 1)) / LETTER_KEYBOARD_PHONE_COLUMNS,
    );
    if (next === keySize || next <= 0) {
      break;
    }
    keySize = next;
  }

  return Math.round(keySize);
}

/** Key size and inter-key gap for a given layout width. */
export function computeLetterKeyLayout(
  width: number,
  options: LetterKeyLayoutOptions = {},
): { keySize: number; gap: number } {
  const keySize = computeLetterKeySize(width, options);
  return { keySize, gap: computeLetterKeyGap(keySize) };
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
