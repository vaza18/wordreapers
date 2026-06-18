/** Avatar colors cycled by player index (mockup palette). */
export const PLAYER_AVATAR_PALETTE = [
  { background: '#E1F5EE', color: '#0F6E56', swatch: '#1D9E75' },
  { background: '#E6F1FB', color: '#185FA5', swatch: '#378ADD' },
  { background: '#FAEEDA', color: '#633806', swatch: '#D85A30' },
  { background: '#EEEDFE', color: '#534AB7', swatch: '#7F77DD' },
  { background: '#FAEEDA', color: '#854F0B', swatch: '#EF9F27' },
  { background: '#FAECE7', color: '#993C1D', swatch: '#E24B4A' },
] as const;

/**
 * Return avatar colors for a player slot.
 */
export function playerAvatarColors(index: number): { background: string; color: string } {
  const palette = PLAYER_AVATAR_PALETTE[index % PLAYER_AVATAR_PALETTE.length];
  return palette ?? PLAYER_AVATAR_PALETTE[0];
}

/**
 * Saturated swatch color for the profile color picker.
 */
export function playerAvatarSwatch(index: number): string {
  const palette = PLAYER_AVATAR_PALETTE[index % PLAYER_AVATAR_PALETTE.length];
  return (palette ?? PLAYER_AVATAR_PALETTE[0]).swatch;
}
