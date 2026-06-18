import type { PlayerStandings } from './scoring.js';
import { assignDisplayRanks } from './scoring.js';

/** Players sharing the same display rank (score + word count). */
export interface StandingsRankGroup {
  rank: number;
  members: readonly PlayerStandings[];
}

/**
 * Group sorted standings by display rank (1,1,2 …).
 */
export function groupStandingsByDisplayRank(
  standings: readonly PlayerStandings[],
): StandingsRankGroup[] {
  if (standings.length === 0) {
    return [];
  }

  const rankByPlayer = assignDisplayRanks(standings);
  const buckets = new Map<number, PlayerStandings[]>();

  for (const row of standings) {
    const rank = rankByPlayer.get(row.playerId) ?? standings.length;
    const list = buckets.get(rank) ?? [];
    list.push(row);
    buckets.set(rank, list);
  }

  return [...buckets.entries()]
    .sort(([rankA], [rankB]) => rankA - rankB)
    .map(([rank, members]) => ({
      rank,
      members: [...members].sort((a, b) => a.playerId.localeCompare(b.playerId, 'en')),
    }));
}

/**
 * True when every player shares rank 1 (full tie, e.g. 0 points each).
 */
export function isFullStandingsTie(standings: readonly PlayerStandings[]): boolean {
  const groups = groupStandingsByDisplayRank(standings);
  return groups.length === 1 && groups[0]?.members.length === standings.length;
}

/**
 * All players at display rank 1 (one or more co-winners).
 */
export function getTopRankGroup(
  standings: readonly PlayerStandings[],
): StandingsRankGroup | undefined {
  return groupStandingsByDisplayRank(standings).find((group) => group.rank === 1);
}
