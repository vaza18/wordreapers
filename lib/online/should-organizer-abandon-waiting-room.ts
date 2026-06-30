import type { GameSession } from '../firebase/types.js';

/**
 * True when the organizer may delete the waiting room root.
 * Keep the session when another roster member is still in the lobby or opted into rematch.
 */
export function shouldOrganizerAbandonWaitingRoom(
  session: GameSession,
  organizerUid: string,
): boolean {
  for (const [uid, player] of Object.entries(session.players)) {
    if (uid === organizerUid) {
      continue;
    }
    if (player.hasLeft === true) {
      continue;
    }
    if (player.online === true) {
      return false;
    }
    if (session.resultsExitedBy?.[uid] === true) {
      return false;
    }
  }
  return true;
}
