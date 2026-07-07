import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import { listFinishedRoundArchives } from '@/lib/online/session/online-session-archive';
import {
  DEFAULT_PLAYER_STATS,
  parsePlayerStats,
  PLAYER_STATS_STORAGE_KEY,
  type PlayerStats,
} from '@/lib/profile/player-stats';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';

export interface PlayerStatsState extends PlayerStats {
  hydrated: boolean;
  hydratePlayerStats: () => Promise<void>;
  recordOnlineRound: (won: boolean, wordsCollected: number) => Promise<void>;
  resetPlayerStats: () => Promise<void>;
}

async function persistPlayerStats(stats: PlayerStats): Promise<void> {
  await AsyncStorage.setItem(PLAYER_STATS_STORAGE_KEY, JSON.stringify(stats));
}

export const usePlayerStatsStore = create<PlayerStatsState>((set, get) => ({
  ...DEFAULT_PLAYER_STATS,
  hydrated: false,

  hydratePlayerStats: async () => {
    const raw = await AsyncStorage.getItem(PLAYER_STATS_STORAGE_KEY);
    let stats = parsePlayerStats(raw);
    const uid = useFirebaseStore.getState().uid;
    if (uid) {
      const archives = await listFinishedRoundArchives();
      const profileName = useProfileStore.getState().name;
      const archived = computeArchivedPlayerStats(archives, uid, profileName);
      if (
        archives.length > 0 &&
        (stats.gamesPlayed !== archived.gamesPlayed ||
          stats.gamesWon !== archived.gamesWon ||
          stats.wordsCollected !== archived.wordsCollected)
      ) {
        stats = archived;
        await persistPlayerStats(stats);
      }
    }
    set({ ...stats, hydrated: true });
  },

  recordOnlineRound: async (won, wordsCollected) => {
    const next: PlayerStats = {
      gamesPlayed: get().gamesPlayed + 1,
      gamesWon: get().gamesWon + (won ? 1 : 0),
      wordsCollected: get().wordsCollected + Math.max(0, wordsCollected),
    };
    await persistPlayerStats(next);
    set(next);
  },

  resetPlayerStats: async () => {
    await AsyncStorage.removeItem(PLAYER_STATS_STORAGE_KEY);
    set({ ...DEFAULT_PLAYER_STATS, hydrated: true });
  },
}));
