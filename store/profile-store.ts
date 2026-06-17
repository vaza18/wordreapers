import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  DEFAULT_PLAYER_PROFILE,
  isProfileComplete,
  parsePlayerProfile,
  PROFILE_STORAGE_KEY,
  type PlayerProfile,
} from '@/lib/profile/player-profile';

export interface ProfileState extends PlayerProfile {
  hydrated: boolean;
  setName: (name: string) => void;
  setGender: (gender: PlayerProfile['gender']) => void;
  setAvatarColorIndex: (index: number) => void;
  saveProfile: () => Promise<void>;
  hydrateProfile: () => Promise<void>;
  isComplete: () => boolean;
}

async function persistProfile(profile: PlayerProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  ...DEFAULT_PLAYER_PROFILE,
  hydrated: false,

  setName: (name) => {
    set({ name });
  },

  setGender: (gender) => {
    set({ gender });
  },

  setAvatarColorIndex: (avatarColorIndex) => {
    set({ avatarColorIndex });
  },

  saveProfile: async () => {
    const { name, gender, avatarColorIndex } = get();
    const profile: PlayerProfile = { name: name.trim(), gender, avatarColorIndex };
    await persistProfile(profile);
    set(profile);
  },

  hydrateProfile: async () => {
    const raw = await AsyncStorage.getItem(PROFILE_STORAGE_KEY);
    const profile = parsePlayerProfile(raw);
    set({ ...profile, hydrated: true });
  },

  isComplete: () => {
    const { name, gender, avatarColorIndex } = get();
    return isProfileComplete({ name, gender, avatarColorIndex });
  },
}));
