import { clampPlayableFontScale } from '@/lib/typography/font-scale';

/**
 * Edge inset at the design diameter (one side). Scales with accessibility like glyph size.
 */
export const AVATAR_EDGE_INSET_RATIO = 0.2;

/** Inset (layout dp) around initials at the design diameter (before accessibility scale). */
export function avatarGlyphInset(designDiameter: number): number {
  return Math.max(2, Math.round(designDiameter * AVATAR_EDGE_INSET_RATIO));
}

const LOCALE = 'uk-UA';

/** Widest bold Cyrillic initials (М, Ш, Щ). */
const EXTRA_WIDE_AVATAR_INITIALS = new Set(['М', 'Ш', 'Щ']);

/** Other wide bold Cyrillic initials. */
const WIDE_AVATAR_INITIALS = new Set(['Б', 'Д', 'Ж', 'Ф', 'Х', 'Ц', 'Ч', 'Ю', 'Я']);

/** Extra horizontal slack so bold glyphs do not clip at the circle edge. */
export const AVATAR_WIDTH_SAFETY_PX = 2;

/** Estimated em-width of one bold initial glyph (relative to fontSize). */
export function avatarInitialCharWidthEm(char: string): number {
  const upper = char.toLocaleUpperCase(LOCALE);
  if (EXTRA_WIDE_AVATAR_INITIALS.has(upper)) {
    return 1.08;
  }
  if (WIDE_AVATAR_INITIALS.has(upper)) {
    return 0.98;
  }
  return 0.64;
}

/** Sum of per-glyph em-widths for horizontal fit checks. */
export function avatarInitialsWidthEm(initials: string): number {
  if (initials.length === 0) {
    return 0;
  }
  return [...initials].reduce((sum, char) => sum + avatarInitialCharWidthEm(char), 0);
}

/** Target glyph size at the design diameter (before accessibility scale). */
export function avatarInitialFillRatio(initialsLength: number): number {
  return initialsLength > 1 ? 0.55 : 0.6;
}

/** Target initial glyph size at the design diameter (before width/height caps). */
export function avatarTargetFontSize(designDiameter: number, initialsLength: number): number {
  return Math.round(designDiameter * avatarInitialFillRatio(initialsLength));
}

/** Final glyph size that fits inside a circle of the given diameter. */
export function avatarInitialFontSize(designDiameter: number, initials: string, scale = 1): number {
  const displaySize = Math.round(designDiameter * scale);
  const inset = Math.round(avatarGlyphInset(designDiameter) * scale);
  const targetFont = Math.round(avatarTargetFontSize(designDiameter, initials.length) * scale);
  const maxByHeight = displaySize - 2 * inset;
  const widthEm = avatarInitialsWidthEm(initials);
  const maxByWidth =
    widthEm > 0 ? Math.floor((displaySize - AVATAR_WIDTH_SAFETY_PX) / widthEm) : targetFont;

  return Math.max(8, Math.min(targetFont, maxByHeight, maxByWidth));
}

/**
 * Avatar circle + glyph sizes at capped OS font scale.
 * Circle matches the design diameter; glyph size is capped so wide pairs (e.g. МШ) fit.
 */
export function computeAvatarDisplay(
  designDiameter: number,
  initials: string,
  systemFontScale: number,
  screenWidth: number,
): { displaySize: number; fontSize: number } {
  const scale = clampPlayableFontScale(systemFontScale, screenWidth);
  const displaySize = Math.round(designDiameter * scale);
  const fontSize = avatarInitialFontSize(designDiameter, initials, scale);
  return { displaySize, fontSize };
}
