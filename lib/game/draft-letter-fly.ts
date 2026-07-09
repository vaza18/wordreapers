import { DRAFT_FLY_GLYPH_WIDTH_RATIO } from '@/constants/compose-draft';

/** Window-coordinate rectangle from `measureInWindow`. */
export type WindowRect = { x: number; y: number; width: number; height: number };

/** 2D point in the same coordinate space as {@link WindowRect}. */
export type Point = { x: number; y: number };

/**
 * Panel-local top-left for the ghost letter at the pressed key.
 * Aligns with `centeredSquareTextStyle(keySize, keyLabelFontSize)` — line box at key top,
 * glyph centered horizontally in the key.
 */
export function draftLetterFlyStartPoint(
  keyRect: WindowRect,
  panelOrigin: Point,
  keyLabelFontSize: number,
): Point {
  const estGlyphWidth = keyLabelFontSize * DRAFT_FLY_GLYPH_WIDTH_RATIO;
  return {
    x: keyRect.x - panelOrigin.x + (keyRect.width - estGlyphWidth) / 2,
    y: keyRect.y - panelOrigin.y,
  };
}

/** Panel-local top-left for the ghost letter, matching draft line box origin. */
export function draftLetterFlyEndPointFromTopLeft(topLeft: Point, panelOrigin: Point): Point {
  return {
    x: topLeft.x - panelOrigin.x,
    y: topLeft.y - panelOrigin.y,
  };
}

/**
 * Whether a queued fly is still valid for the current draft length.
 * measureInWindow often runs before React re-renders after onPressKey, so draftLength
 * may still equal charIndex; reject only when backspace removed the target slot.
 */
export function isPendingDraftFlyValid(charIndex: number, draftLength: number): boolean {
  return charIndex <= draftLength;
}
