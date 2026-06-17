import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { listFinishedRoundArchives } from '@/lib/online/online-session-archive';
import { sumArchivedWordCountForPlayer } from '@/lib/online/sum-archived-word-count';
import {
  DEFAULT_PLAYER_STATS,
  parsePlayerStats,
  PLAYER_STATS_STORAGE_KEY,
  type PlayerStats,
} from '@/lib/profile/player-stats';
import { useFirebaseStore } from '@/store/firebase-store';

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
    if (stats.gamesPlayed > 0 && stats.wordsCollected === 0) {
      const uid = useFirebaseStore.getState().uid;
      if (uid) {
        const archives = await listFinishedRoundArchives();
        const archivedWords = sumArchivedWordCountForPlayer(archives, uid);
        if (archivedWords > 0) {
          stats = { ...stats, wordsCollected: archivedWords };
          await persistPlayerStats(stats);
        }
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
