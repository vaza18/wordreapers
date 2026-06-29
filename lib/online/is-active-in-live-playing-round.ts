import type { GameSession } from '../firebase/types.js';

/** True when this player opted into the current live `playing` round (rematch presence). */
export function isActiveInLivePlayingRound(
  session: Pick<GameSession, 'status' | 'players'> | null | undefined,
  playerId: string,
): boolean {
  if (!session || session.status !== 'playing' || !playerId) {
    return false;
  }
  const player = session.players[playerId];
  if (!player || player.hasLeft === true) {
    return false;
  }
  return player.online === true;
}
