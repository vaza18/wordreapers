import type { GameSession } from '../../firebase/types.js';

/** True when every roster player has `online: false` (or missing flag). */
export function allSessionPlayersOffline(session: GameSession): boolean {
  const entries = Object.values(session.players);
  if (entries.length === 0) {
    return false;
  }
  return entries.every((player) => player.online !== true);
}
