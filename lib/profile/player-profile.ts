import type { PlayerGender } from '@/lib/game/grammar';

import { clampAvatarColorIndex } from '@/constants/player-avatars';

export const PROFILE_STORAGE_KEY = 'wordreapers.playerProfile';

/** Local guest profile for multiplayer (TZ §5). */
export interface PlayerProfile {
  name: string;
  gender: PlayerGender;
  avatarColorIndex: number;
}

export const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  name: '',
  gender: null,
  avatarColorIndex: 0,
};

/**
 * Return whether the profile has the minimum fields for joining a room.
 */
export function isProfileComplete(profile: PlayerProfile): boolean {
  return profile.name.trim().length >= 1;
}

/**
 * Parse persisted JSON profile.
 */
export function parsePlayerProfile(raw: string | null): PlayerProfile {
  if (!raw) {
    return DEFAULT_PLAYER_PROFILE;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    const gender =
      parsed.gender === 'm' || parsed.gender === 'f' || parsed.gender === null
        ? parsed.gender
        : null;
    const index =
      typeof parsed.avatarColorIndex === 'number' && Number.isFinite(parsed.avatarColorIndex)
        ? clampAvatarColorIndex(parsed.avatarColorIndex)
        : 0;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      gender,
      avatarColorIndex: index,
    };
  } catch {
    return DEFAULT_PLAYER_PROFILE;
  }
}
