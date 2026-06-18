import { abandonWaitingGameSession } from '../firebase/game-session-service.js';

import { takeOrganizerWaitingRoom } from './organizer-waiting-room.js';

/**
 * Delete a stale waiting room when the organizer starts a new one or leaves the flow.
 */
export async function abandonTrackedOrganizerWaitingRoom(organizerUid: string): Promise<void> {
  const gameId = takeOrganizerWaitingRoom();
  if (!gameId) {
    return;
  }
  await abandonWaitingGameSession(gameId, organizerUid);
}
