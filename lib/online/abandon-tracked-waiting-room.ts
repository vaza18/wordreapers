import { get, ref } from 'firebase/database';

import {
  abandonWaitingGameSession,
  organizerLeaveWaitingLobby,
} from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import type { GameSession } from '../firebase/types.js';

import { getLocalRoomDraft } from './local-room-draft.js';
import { shouldOrganizerAbandonWaitingRoom } from './should-organizer-abandon-waiting-room.js';
import { setOrganizerWaitingRoom, takeOrganizerWaitingRoom } from './organizer-waiting-room.js';
import { ensureAnonymousAuth } from '../firebase/auth.js';

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

async function abandonWaitingRoomSession(gameId: string, organizerUid: string): Promise<void> {
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

/**
 * Leave or delete a tracked waiting room when the organizer starts a new one or leaves the flow.
 */
export async function abandonTrackedOrganizerWaitingRoom(organizerUid: string): Promise<void> {
  const gameId = takeOrganizerWaitingRoom();
  if (!gameId) {
    return;
  }

  await abandonWaitingRoomSession(gameId, organizerUid);
}

/**
 * Drop published waiting rooms for a local draft (e.g. organizer left lobby for solo training).
 */
export async function abandonOrganizerWaitingRoomForDraft(draftId: string): Promise<void> {
  const user = await ensureAnonymousAuth();
  if (!user?.uid) {
    return;
  }

  const gameIds = new Set<string>();
  const tracked = takeOrganizerWaitingRoom();
  if (tracked) {
    gameIds.add(tracked);
  }
  const draft = getLocalRoomDraft(draftId);
  if (draft?.publishedGameId) {
    gameIds.add(draft.publishedGameId);
  }
  if (gameIds.size === 0) {
    return;
  }

  for (const gameId of gameIds) {
    await abandonWaitingRoomSession(gameId, user.uid);
  }
  setOrganizerWaitingRoom(null);
}
