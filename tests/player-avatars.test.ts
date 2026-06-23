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

  it('clamps persisted indices to the palette range', () => {
    expect(clampAvatarColorIndex(-1)).toBe(0);
    expect(clampAvatarColorIndex(999)).toBe(PLAYER_AVATAR_COLOR_COUNT - 1);
  });
});
