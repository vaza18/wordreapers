/** Same width breakpoint as letter keyboard tablet layout (dp). */
export const TABLET_LAYOUT_MIN_WIDTH = 600;

/** Max OS font scale on phones — keeps compose row usable. */
export const MAX_PLAYABLE_FONT_SCALE_PHONE = 1.4;

/** Max OS font scale on tablets. */
export const MAX_PLAYABLE_FONT_SCALE_TABLET = 2.5;

/** True when layout width is at or above the tablet breakpoint (any OS). */
export function isTabletLayoutWidth(screenWidth: number): boolean {
  return screenWidth >= TABLET_LAYOUT_MIN_WIDTH;
}

/** Max playable font scale from current layout width (phones vs tablets). */
export function getMaxPlayableFontScale(screenWidth = 0): number {
  return isTabletLayoutWidth(screenWidth)
    ? MAX_PLAYABLE_FONT_SCALE_TABLET
    : MAX_PLAYABLE_FONT_SCALE_PHONE;
}

/** Clamp system font scale for in-app typography and play layout. */
export function clampPlayableFontScale(fontScale: number, screenWidth?: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 0) {
    return 1;
  }
  if (fontScale < 1) {
    return fontScale;
  }
  return Math.min(fontScale, getMaxPlayableFontScale(screenWidth ?? 0));
}

/** Scale a fixed-layout box (avatar circle) with capped OS font scale. */
export function playableLayoutSize(
  baseSize: number,
  systemFontScale: number,
  screenWidth: number,
): number {
  return Math.round(baseSize * clampPlayableFontScale(systemFontScale, screenWidth));
}

/**
 * Scale glyph size inside a fixed square (letter key, avatar initial).
 * Caps fill so text stays inside the container at high accessibility settings.
 */
export function playableGlyphFontSize(
  baseFontSize: number,
  systemFontScale: number,
  screenWidth: number,
  containerSize: number,
  maxFillRatio = 0.72,
): number {
  const scaled = Math.round(baseFontSize * clampPlayableFontScale(systemFontScale, screenWidth));
  const maxSize = Math.round(containerSize * maxFillRatio);
  return Math.min(scaled, maxSize);
}

/** Whether the current layout should use the looser tablet font-scale cap. */
export function isTabletFontScaleLayout(screenWidth: number): boolean {
  return isTabletLayoutWidth(screenWidth);
}
