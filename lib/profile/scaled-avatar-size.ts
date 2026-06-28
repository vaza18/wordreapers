import { clampPlayableFontScale } from '@/lib/typography/font-scale';

/**
 * Edge inset at the design diameter (one side). Scales with accessibility like glyph size.
 */
export const AVATAR_EDGE_INSET_RATIO = 0.2;

/** Inset (layout dp) around initials at the design diameter (before accessibility scale). */
export function avatarGlyphInset(designDiameter: number): number {
  return Math.max(2, Math.round(designDiameter * AVATAR_EDGE_INSET_RATIO));
}

/** Target glyph size at the design diameter (before accessibility scale). */
export function avatarInitialFillRatio(initialsLength: number): number {
  // Two glyphs must fit side by side; wide Cyrillic letters (М, Ш, Щ, …) need a smaller fill.
  return initialsLength > 1 ? 0.46 : 0.6;
}

/** Base initial glyph size at the design diameter. */
export function avatarInitialFontSize(designDiameter: number, initialsLength: number): number {
  return Math.round(designDiameter * avatarInitialFillRatio(initialsLength));
}

/**
 * Avatar circle + glyph sizes at capped OS font scale.
 * Glyph and edge inset both multiply by scale — fill ratio stays like the design size.
 */
export function computeAvatarDisplay(
  designDiameter: number,
  initialsLength: number,
  systemFontScale: number,
  screenWidth: number,
): { displaySize: number; fontSize: number } {
  const scale = clampPlayableFontScale(systemFontScale, screenWidth);
  const baseInset = avatarGlyphInset(designDiameter);
  const baseFont = avatarInitialFontSize(designDiameter, initialsLength);
  const fontSize = Math.round(baseFont * scale);
  const inset = Math.round(baseInset * scale);
  const displaySize = fontSize + 2 * inset;
  return { displaySize, fontSize };
}
