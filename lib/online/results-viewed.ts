import type { GameSession } from '../firebase/types.js';

/**
 * Whether this player still needs an explicit `resultsExitedBy` write.
 * Early leavers (`hasLeft` / `online: false`) already satisfy cleanup via offline presence.
 */
export function shouldMarkResultsExited(session: GameSession, playerId: string): boolean {
  if (session.resultsExitedBy?.[playerId] === true) {
    return false;
  }
  const player = session.players[playerId];
  if (!player) {
    return false;
  }
  return player.hasLeft !== true && player.online !== false;
}
