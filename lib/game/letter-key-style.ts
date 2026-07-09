/**
 * Shared letter-key geometry for app icons and the play screen keyboard.
 */
import { radii } from '@/constants/theme';
import {
  LETTER_KEY_FONT_SIZE,
  LETTER_KEY_REFERENCE_KEY_SIZE,
  LETTER_KEY_REFERENCE_SCREEN_WIDTH,
} from '@/constants/letter-keyboard';

import { computeLetterKeyGap, computeLetterKeySize } from './letter-keyboard.js';

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

/** Font size scaled to a key edge length. */
export function letterKeyFontSizeForKeySize(keySize: number): number {
  return Math.round(keySize * (LETTER_KEY_FONT_SIZE / LETTER_KEY_REFERENCE_KEY_SIZE));
}

/**
 * Letter-key geometry ratios from the live play screen (`LetterKeyboard`).
 */
export function letterKeyProportions(
  screenWidth = LETTER_KEY_REFERENCE_SCREEN_WIDTH,
): LetterKeyProportions {
  const keySize = computeLetterKeySize(screenWidth);
  const gap = computeLetterKeyGap(keySize);
  const borderRadius = radii.sm;
  const fontSize = letterKeyFontSizeForKeySize(keySize);

  return {
    keySize,
    gap,
    borderRadius,
    fontSize,
    borderRadiusRatio: borderRadius / keySize,
    gapRatio: gap / keySize,
    fontSizeRatio: fontSize / keySize,
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
