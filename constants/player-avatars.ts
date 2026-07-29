/**
 * Avatar hues — Ukrainian flag blue/yellow pair after green, then distinct warm/cool slots.
 * Mid orange vs deep red: separable from each other and from flag yellow.
 * Sky cyan closes the rainbow gap vs navy blue without colliding with green.
 */
export const PLAYER_AVATAR_PALETTE = [
  { swatch: '#16A34A', initials: '#FFFFFF' },
  { swatch: '#005BBB', initials: '#FFD500' },
  { swatch: '#FFD500', initials: '#005BBB' },
  { swatch: '#C026D3', initials: '#FFFFFF' },
  { swatch: '#F97316', initials: '#FFFFFF' },
  { swatch: '#B91C1C', initials: '#FFFFFF' },
  { swatch: '#0EA5E9', initials: '#FFFFFF' },
] as const;

export const PLAYER_AVATAR_COLOR_COUNT = PLAYER_AVATAR_PALETTE.length;

/**
 * Clamp a persisted palette index to the valid range.
 */
export function clampAvatarColorIndex(index: number): number {
  return Math.max(0, Math.min(PLAYER_AVATAR_COLOR_COUNT - 1, Math.round(index)));
}

/**
 * Return avatar fill and initials colors for a player slot.
 */
export function playerAvatarColors(index: number): { background: string; color: string } {
  const entry =
    PLAYER_AVATAR_PALETTE[index % PLAYER_AVATAR_COLOR_COUNT] ?? PLAYER_AVATAR_PALETTE[0];
  return { background: entry.swatch, color: entry.initials };
}

/**
 * Saturated swatch color for the profile color picker and avatar fill.
 */
export function playerAvatarSwatch(index: number): string {
  const entry =
    PLAYER_AVATAR_PALETTE[index % PLAYER_AVATAR_COLOR_COUNT] ?? PLAYER_AVATAR_PALETTE[0];
  return entry.swatch;
}
