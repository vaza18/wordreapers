import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { computeArchivedPlayerStats } from '@/lib/online/compute-archived-player-stats';
import { listFinishedRoundArchives } from '@/lib/online/session/online-session-archive';
import {
  DEFAULT_SPLIT_PLAYER_STATS,
  parseSplitPlayerStats,
  PLAYER_STATS_STORAGE_KEY,
  splitPlayerStatsEqual,
  type PlayerStatsRoundKind,
  type SplitPlayerStats,
} from '@/lib/profile/player-stats';
import { useFirebaseStore } from '@/store/firebase-store';
import { useProfileStore } from '@/store/profile-store';

export interface PlayerStatsState extends SplitPlayerStats {
  hydrated: boolean;
  hydratePlayerStats: () => Promise<void>;
  recordOnlineRound: (
    won: boolean,
    wordsCollected: number,
    kind?: PlayerStatsRoundKind,
  ) => Promise<void>;
  resetPlayerStats: () => Promise<void>;
}

async function persistSplitPlayerStats(stats: SplitPlayerStats): Promise<void> {
  await AsyncStorage.setItem(PLAYER_STATS_STORAGE_KEY, JSON.stringify(stats));
}

export const usePlayerStatsStore = create<PlayerStatsState>((set, get) => ({
  competition: { ...DEFAULT_SPLIT_PLAYER_STATS.competition },
  training: { ...DEFAULT_SPLIT_PLAYER_STATS.training },
  hydrated: false,

  hydratePlayerStats: async () => {
    const raw = await AsyncStorage.getItem(PLAYER_STATS_STORAGE_KEY);
    let stats = parseSplitPlayerStats(raw);
    const uid = useFirebaseStore.getState().uid;
    if (uid) {
      const archives = await listFinishedRoundArchives();
      const profileName = useProfileStore.getState().name;
      const archived = computeArchivedPlayerStats(archives, uid, profileName);
      if (archives.length > 0 && !splitPlayerStatsEqual(stats, archived)) {
        stats = archived;
        await persistSplitPlayerStats(stats);
      }
    }
    set({ ...stats, hydrated: true });
  },

  recordOnlineRound: async (won, wordsCollected, kind = 'competition') => {
    const words = Math.max(0, wordsCollected);
    const current = get();
    const next: SplitPlayerStats =
      kind === 'training'
        ? {
            competition: { ...current.competition },
            training: {
              roundsPlayed: current.training.roundsPlayed + 1,
              wordsCollected: current.training.wordsCollected + words,
            },
          }
        : {
            competition: {
              gamesPlayed: current.competition.gamesPlayed + 1,
              gamesWon: current.competition.gamesWon + (won ? 1 : 0),
              wordsCollected: current.competition.wordsCollected + words,
            },
            training: { ...current.training },
          };
    await persistSplitPlayerStats(next);
    set(next);
  },

  resetPlayerStats: async () => {
    await AsyncStorage.removeItem(PLAYER_STATS_STORAGE_KEY);
    set({
      competition: { ...DEFAULT_SPLIT_PLAYER_STATS.competition },
      training: { ...DEFAULT_SPLIT_PLAYER_STATS.training },
      hydrated: true,
    });
  },
}));
