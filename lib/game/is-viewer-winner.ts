import type { PlayerResultRankGroup } from './results-view.js';

/**
 * True when the viewer is among players at display rank 1 (solo, sole winner, or co-winner).
 */
export function isViewerWinner(
  playerRankGroups: readonly PlayerResultRankGroup[],
  viewerPlayerId: string,
): boolean {
  for (const group of playerRankGroups) {
    if (!group.isTopRank) {
      continue;
    }
    return group.players.some((player) => player.playerId === viewerPlayerId);
  }
  return false;
}
