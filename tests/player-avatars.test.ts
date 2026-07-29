import { describe, expect, it } from 'vitest';

import {
  clampAvatarColorIndex,
  PLAYER_AVATAR_COLOR_COUNT,
  playerAvatarColors,
} from '@/constants/player-avatars';

describe('player avatar palette', () => {
  it('includes Ukrainian flag blue and yellow as adjacent slots', () => {
    expect(playerAvatarColors(1).background).toBe('#005BBB');
    expect(playerAvatarColors(2).background).toBe('#FFD500');
  });

  it('uses blue initials on the yellow swatch for contrast', () => {
    expect(playerAvatarColors(2).color).toBe('#005BBB');
  });

  it('keeps mid orange distinct from yellow and deep red', () => {
    expect(playerAvatarColors(2).background).toBe('#FFD500');
    expect(playerAvatarColors(4).background).toBe('#F97316');
    expect(playerAvatarColors(4).color).toBe('#FFFFFF');
    expect(playerAvatarColors(5).background).toBe('#B91C1C');
  });

  it('adds sky cyan as a seventh slot distinct from navy blue', () => {
    expect(PLAYER_AVATAR_COLOR_COUNT).toBe(7);
    expect(playerAvatarColors(1).background).toBe('#005BBB');
    expect(playerAvatarColors(6).background).toBe('#0EA5E9');
    expect(playerAvatarColors(6).color).toBe('#FFFFFF');
  });

  it('clamps persisted indices to the palette range', () => {
    expect(clampAvatarColorIndex(-1)).toBe(0);
    expect(clampAvatarColorIndex(999)).toBe(PLAYER_AVATAR_COLOR_COUNT - 1);
  });
});
