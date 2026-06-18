/**
 * Shared letter-key geometry for app icons and (eventually) the play screen.
 *
 * TODO: Wire `LetterKeyboard` to this module so gap, radius, and fontSize scale from
 * `letterKeyProportions(screenWidth)` instead of duplicating theme tokens inline.
 * Until then, keep `LETTER_KEY_*` constants in sync with `components/LetterKeyboard.tsx`.
 */
import { radii, spacing } from '../../constants/theme.js';

import { computeLetterKeySize } from './letter-keyboard.js';

/** Typical phone width for deriving letter-key ratios (iPhone 15 class). */
export const LETTER_KEY_REFERENCE_SCREEN_WIDTH = 390;

/** Gameplay letter key font size (px); fixed in `LetterKeyboard`. */
export const LETTER_KEY_FONT_SIZE = 40;

/** Semibold label on available keys (`LetterKeyboard`). */
export const LETTER_KEY_FONT_WEIGHT = 700;

/** Pixel and ratio geometry for a letter key at a given screen width. */
export interface LetterKeyProportions {
  keySize: number;
  gap: number;
  borderRadius: number;
  fontSize: number;
  borderRadiusRatio: number;
  gapRatio: number;
  fontSizeRatio: number;
}

/**
 * Letter-key geometry ratios from the live play screen (`LetterKeyboard`).
 */
export function letterKeyProportions(
  screenWidth = LETTER_KEY_REFERENCE_SCREEN_WIDTH,
): LetterKeyProportions {
  const keySize = computeLetterKeySize(screenWidth);
  const gap = spacing.xs;
  const borderRadius = radii.sm;

  return {
    keySize,
    gap,
    borderRadius,
    fontSize: LETTER_KEY_FONT_SIZE,
    borderRadiusRatio: borderRadius / keySize,
    gapRatio: gap / keySize,
    fontSizeRatio: LETTER_KEY_FONT_SIZE / keySize,
  };
}

/**
 * Inset from a grid cell edge so tile size + inter-tile gap matches gameplay.
 *
 * `2 * inset / (cellSize - 2 * inset) === gap / keySize`
 */
export function tileInsetForCell(cellSize: number, proportions: LetterKeyProportions): number {
  const { gapRatio } = proportions;
  return (cellSize * gapRatio) / (2 + 2 * gapRatio);
}

/** Letter tile edge length inside a grid cell after inset. */
export function tileSizeForCell(cellSize: number, inset: number): number {
  return cellSize - 2 * inset;
}
