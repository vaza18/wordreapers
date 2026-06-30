import type { GameSessionSnapshot } from '../firebase/game-session-service.js';
import { liveParticipantIds } from './live-round-membership.js';

/**
 * Stable signature for play toast detection — avoids effect churn on unrelated session fields.
 */
export function playToastSessionSignature(session: GameSessionSnapshot): string {
  const participantIds = liveParticipantIds(session).sort();
  const playerParts = participantIds.map((uid) => {
    const player = session.players[uid];
    if (!player) {
      return `${uid}:missing`;
    }
    return `${uid}:${player.online}:${player.hasLeft}:${player.score}:${player.wordCount}:${player.name}`;
  });
  return `${session.id}:${session.status}:${session.baseWordRound ?? 0}:${playerParts.join('|')}`;
}
