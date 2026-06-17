import type { GameSession } from '../firebase/types.js';

/** Players still in the round (excludes those who left voluntarily). */
export function votingPlayerIds(session: GameSession): string[] {
  return Object.entries(session.players)
    .filter(([, player]) => player.hasLeft !== true)
    .map(([id]) => id);
}
