import type { GameSession } from '../firebase/types.js';

/** Everyone who joined this round (includes players who left voluntarily). */
export function joinedParticipantIds(session: GameSession): string[] {
  return Object.keys(session.players);
}
