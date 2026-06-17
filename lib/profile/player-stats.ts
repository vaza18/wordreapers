import { assignDisplayRanks, type PlayerStandings } from '@/lib/game/scoring';

export const PLAYER_STATS_STORAGE_KEY = 'wordreapers.playerStats';

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  wordsCollected: number;
}

export const DEFAULT_PLAYER_STATS: PlayerStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  wordsCollected: 0,
};

/**
 * Case-insensitive name match for attributing local games to the profile player.
 */
export function normalizeProfilePlayerName(name: string): string {
  return name.trim().toLocaleLowerCase('uk-UA');
}

/**
 * Parse persisted stats JSON.
 */
export function parsePlayerStats(raw: string | null): PlayerStats {
  if (!raw) {
    return DEFAULT_PLAYER_STATS;
  }
  try {
    const data = JSON.parse(raw) as Partial<PlayerStats>;
    const gamesPlayed =
      typeof data.gamesPlayed === 'number' && data.gamesPlayed >= 0
        ? Math.floor(data.gamesPlayed)
        : 0;
    const gamesWon =
      typeof data.gamesWon === 'number' && data.gamesWon >= 0 ? Math.floor(data.gamesWon) : 0;
    const wordsCollected =
      typeof data.wordsCollected === 'number' && data.wordsCollected >= 0
        ? Math.floor(data.wordsCollected)
        : 0;
    return { gamesPlayed, gamesWon, wordsCollected };
  } catch {
    return DEFAULT_PLAYER_STATS;
  }
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
