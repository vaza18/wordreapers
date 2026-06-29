import type { GameSession } from '../firebase/types.js';

import { liveParticipantIds } from './live-round-membership.js';

/** Players still in the round (excludes those who left voluntarily). */
export function votingPlayerIds(session: GameSession): string[] {
  if (session.status === 'playing') {
    return liveParticipantIds(session);
  }
  return Object.entries(session.players)
    .filter(([, player]) => player.hasLeft !== true)
    .map(([id]) => id);
}
