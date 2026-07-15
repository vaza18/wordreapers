import { assignDisplayRanks, type PlayerStandings } from '@/lib/game/scoring';

export const PLAYER_STATS_STORAGE_KEY = 'wordreapers.playerStats';

/** Flat counters — used by cloud `user_stats` and legacy local payloads. */
export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  wordsCollected: number;
}

export interface CompetitionPlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  wordsCollected: number;
}

export interface TrainingPlayerStats {
  roundsPlayed: number;
  wordsCollected: number;
}

/** Local profile stats split into multiplayer competition vs solo training. */
export interface SplitPlayerStats {
  competition: CompetitionPlayerStats;
  training: TrainingPlayerStats;
}

export type PlayerStatsRoundKind = 'competition' | 'training';

export const DEFAULT_COMPETITION_STATS: CompetitionPlayerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  wordsCollected: 0,
};

export const DEFAULT_TRAINING_STATS: TrainingPlayerStats = {
  roundsPlayed: 0,
  wordsCollected: 0,
};

export const DEFAULT_SPLIT_PLAYER_STATS: SplitPlayerStats = {
  competition: { ...DEFAULT_COMPETITION_STATS },
  training: { ...DEFAULT_TRAINING_STATS },
};

/**
 * Case-insensitive name match for attributing local games to the profile player.
 */
export function normalizeProfilePlayerName(name: string): string {
  return name.trim().toLocaleLowerCase('uk-UA');
}

function nonNegInt(value: unknown): number {
  return typeof value === 'number' && value >= 0 ? Math.floor(value) : 0;
}

function parseCompetitionStats(raw: unknown): CompetitionPlayerStats {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_COMPETITION_STATS };
  }
  const data = raw as Partial<CompetitionPlayerStats>;
  return {
    gamesPlayed: nonNegInt(data.gamesPlayed),
    gamesWon: nonNegInt(data.gamesWon),
    wordsCollected: nonNegInt(data.wordsCollected),
  };
}

function parseTrainingStats(raw: unknown): TrainingPlayerStats {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_TRAINING_STATS };
  }
  const data = raw as Partial<TrainingPlayerStats>;
  return {
    roundsPlayed: nonNegInt(data.roundsPlayed),
    wordsCollected: nonNegInt(data.wordsCollected),
  };
}

/**
 * Parse persisted stats JSON.
 * Legacy flat `{ gamesPlayed, gamesWon, wordsCollected }` maps to competition-only
 * (training zeros) — those totals mixed solo and multiplayer before the split.
 */
export function parseSplitPlayerStats(raw: string | null): SplitPlayerStats {
  if (!raw) {
    return {
      competition: { ...DEFAULT_COMPETITION_STATS },
      training: { ...DEFAULT_TRAINING_STATS },
    };
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if ('competition' in data || 'training' in data) {
      return {
        competition: parseCompetitionStats(data.competition),
        training: parseTrainingStats(data.training),
      };
    }
    // Legacy flat payload → competition only.
    return {
      competition: {
        gamesPlayed: nonNegInt(data.gamesPlayed),
        gamesWon: nonNegInt(data.gamesWon),
        wordsCollected: nonNegInt(data.wordsCollected),
      },
      training: { ...DEFAULT_TRAINING_STATS },
    };
  } catch {
    return {
      competition: { ...DEFAULT_COMPETITION_STATS },
      training: { ...DEFAULT_TRAINING_STATS },
    };
  }
}

/**
 * Parse flat stats (cloud / legacy callers). Prefer `parseSplitPlayerStats` for local UI.
 */
export function parsePlayerStats(raw: string | null): PlayerStats {
  const split = parseSplitPlayerStats(raw);
  return {
    gamesPlayed: split.competition.gamesPlayed + split.training.roundsPlayed,
    gamesWon: split.competition.gamesWon,
    wordsCollected: split.competition.wordsCollected + split.training.wordsCollected,
  };
}

export function splitPlayerStatsEqual(a: SplitPlayerStats, b: SplitPlayerStats): boolean {
  return (
    a.competition.gamesPlayed === b.competition.gamesPlayed &&
    a.competition.gamesWon === b.competition.gamesWon &&
    a.competition.wordsCollected === b.competition.wordsCollected &&
    a.training.roundsPlayed === b.training.roundsPlayed &&
    a.training.wordsCollected === b.training.wordsCollected
  );
}

/**
 * Whether a finished local round should count toward profile stats.
 */
export function shouldCountLocalRoundForProfile(
  profileName: string,
  playerNames: readonly string[],
): boolean {
  const key = normalizeProfilePlayerName(profileName);
  if (!key) {
    return false;
  }
  return playerNames.some((name) => normalizeProfilePlayerName(name) === key);
}

/**
 * Whether the profile player won (display rank 1, ties included).
 */
/**
 * Whether this Firebase uid finished at display rank 1 (ties included).
 */
export function didPlayerWinOnlineRound(
  playerId: string,
  standings: readonly PlayerStandings[],
): boolean {
  const ranks = assignDisplayRanks(standings);
  return ranks.get(playerId) === 1;
}

export function didProfilePlayerWinLocalRound(
  profileName: string,
  playerNames: readonly string[],
  standings: readonly PlayerStandings[],
): boolean {
  const key = normalizeProfilePlayerName(profileName);
  const index = playerNames.findIndex((name) => normalizeProfilePlayerName(name) === key);
  if (index < 0) {
    return false;
  }
  const id = `player-${index}`;
  const ranks = assignDisplayRanks(standings);
  return ranks.get(id) === 1;
}
