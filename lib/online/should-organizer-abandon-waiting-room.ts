import type { GameSession } from '../firebase/types.js';
import { isRematchDurableLobbyOptIn } from './rematch/rematch-waiting-lobby.js';

/**
 * True when the organizer may delete the waiting room root.
 * Keep the session when another roster member is still in the lobby or opted into rematch
 * (online, latch, picker seat, or committed base word — same durable signals as lobby visibility).
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
    if (isRematchDurableLobbyOptIn(session, uid)) {
      return false;
    }
  }
  return true;
}
