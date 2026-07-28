import type { GameSession } from '../firebase/types.js';
import {
  isRematchDurableLobbyOptIn,
  isRematchWaitingLobby,
} from './rematch/rematch-waiting-lobby.js';

/**
 * Sync-only rematch gate (organizer-inclusive).
 *
 * `shouldOrganizerAbandonWaitingRoom` intentionally ignores the organizer so
 * explicit leave can delete an empty room. Sync must still keep rematch waiting
 * when the first rematcher is alone offline with a durable latch/picker/word —
 * otherwise pause → foreground deletes the room.
 *
 * Do not collapse this into organizer-leave abandon without preserving that case.
 * Truly abandoned rematch rooms (latch left forever, everyone offline) are cleaned
 * by Cloud Functions `purgeExpiredRtdbSessions` after ABANDONED_RETENTION_MS (7d)
 * from `createdAt` — not by client sync.
 */
export function shouldSyncKeepRematchWaitingRoom(session: GameSession): boolean {
  if (!isRematchWaitingLobby(session)) {
    return false;
  }
  return Object.entries(session.players).some(
    ([playerUid, player]) =>
      player.hasLeft !== true && isRematchDurableLobbyOptIn(session, playerUid),
  );
}
