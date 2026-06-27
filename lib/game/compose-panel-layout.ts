import { letterKeyFontSizeForKeySize } from '@/lib/game/letter-key-style';
import { playableGlyphFontSize } from '@/lib/typography/font-scale';
import {
  HEADER_ICON_SHUFFLE_GLYPH_SIZE,
  scaledHeaderTextGlyphInButton,
} from '@/lib/ui/header-icon-button-layout';

/** Max vertical fill for draft text inside the compose row (multi-char line). */
export const COMPOSE_DRAFT_MAX_FILL = 0.58;

/** Design-time ⌫ glyph size relative to the compose key square. */
export const COMPOSE_BACKSPACE_GLYPH_SIZE = HEADER_ICON_SHUFFLE_GLYPH_SIZE;

/** Draft font size capped to the compose row height. */
export function composeDraftFontSize(
  composeKeySize: number,
  systemFontScale: number,
  screenWidth: number,
): number {
  const baseFont = letterKeyFontSizeForKeySize(composeKeySize);
  return playableGlyphFontSize(
    baseFont,
    systemFontScale,
    screenWidth,
    composeKeySize,
    COMPOSE_DRAFT_MAX_FILL,
  );
}

/** ⌫ glyph size capped to the backspace key square, floored to match the clear icon. */
export function composeBackspaceGlyphSize(
  composeKeySize: number,
  systemFontScale: number,
  screenWidth: number,
): number {
  const scaled = scaledHeaderTextGlyphInButton(
    COMPOSE_BACKSPACE_GLYPH_SIZE,
    systemFontScale,
    screenWidth,
    composeKeySize,
  );
  const floor = composeClearIconSize(composeKeySize);
  const cap = Math.round(composeKeySize * 0.58);
  return Math.min(Math.max(scaled, floor), cap);
}

/** Clear-draft SVG icon size inside the compose key square. */
export function composeClearIconSize(composeKeySize: number): number {
  return Math.round(composeKeySize * 0.46);
}
