import {
  clampPlayableFontScale,
  playableGlyphFontSize,
  playableLayoutSize,
} from '@/lib/typography/font-scale';

/** Design-time square chrome for stack/home header icon buttons. */
export const HEADER_ICON_BUTTON_SIZE = 40;

export const HEADER_ICON_BACK_GLYPH_SIZE = 22;
export const HEADER_ICON_SETTINGS_GLYPH_SIZE = 20;
export const HEADER_ICON_INFO_GLYPH_SIZE = 20;
export const HEADER_ICON_REFRESH_GLYPH_SIZE = 20;
export const HEADER_ICON_SHUFFLE_GLYPH_SIZE = 20;

/** Max fill for text glyphs (↺) whose ink extends past the em box. */
export const HEADER_ICON_TEXT_GLYPH_MAX_FILL = 0.58;

/** @deprecated Use {@link HEADER_ICON_BUTTON_SIZE} */
export const headerIconButtonSize = HEADER_ICON_BUTTON_SIZE;

/** Button edge length at capped OS font scale. */
export function scaledHeaderIconButtonSize(systemFontScale: number, screenWidth: number): number {
  return playableLayoutSize(HEADER_ICON_BUTTON_SIZE, systemFontScale, screenWidth);
}

/** Icon glyph size at capped OS font scale. */
export function scaledHeaderIconGlyphSize(
  designGlyphSize: number,
  systemFontScale: number,
  screenWidth: number,
): number {
  return Math.round(designGlyphSize * clampPlayableFontScale(systemFontScale, screenWidth));
}

/** Text glyph size capped to fit inside a scaled header button square. */
export function scaledHeaderTextGlyphInButton(
  designGlyphSize: number,
  systemFontScale: number,
  screenWidth: number,
  buttonSize: number,
): number {
  return playableGlyphFontSize(
    designGlyphSize,
    systemFontScale,
    screenWidth,
    buttonSize,
    HEADER_ICON_TEXT_GLYPH_MAX_FILL,
  );
}
