import { get, ref } from 'firebase/database';

import {
  abandonWaitingGameSession,
  organizerLeaveWaitingLobby,
} from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import type { GameSession } from '../firebase/types.js';

import { shouldOrganizerAbandonWaitingRoom } from './should-organizer-abandon-waiting-room.js';
import { takeOrganizerWaitingRoom } from './organizer-waiting-room.js';

async function readWaitingSession(gameId: string): Promise<GameSession | null> {
  try {
    const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(gameId)));
    if (!snapshot.exists()) {
      return null;
    }
    const session = snapshot.val() as GameSession;
    return session.status === 'waiting' ? session : null;
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Leave or delete a tracked waiting room when the organizer starts a new one or leaves the flow.
 */
export async function abandonTrackedOrganizerWaitingRoom(organizerUid: string): Promise<void> {
  const gameId = takeOrganizerWaitingRoom();
  if (!gameId) {
    return;
  }

  const session = await readWaitingSession(gameId);
  if (!session) {
    return;
  }

  if (shouldOrganizerAbandonWaitingRoom(session, organizerUid)) {
    await abandonWaitingGameSession(gameId, organizerUid);
    return;
  }

  await organizerLeaveWaitingLobby(gameId, organizerUid, session);
}
