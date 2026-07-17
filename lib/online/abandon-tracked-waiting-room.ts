import { get, ref } from 'firebase/database';

import {
  abandonWaitingGameSession,
  organizerLeaveWaitingLobby,
} from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import type { GameSession } from '../firebase/types.js';

import { getLocalRoomDraft, updateLocalRoomDraft } from './local-room-draft.js';
import { shouldOrganizerAbandonWaitingRoom } from './should-organizer-abandon-waiting-room.js';
import { getOrganizerWaitingRoom, takeOrganizerWaitingRoom } from './organizer-waiting-room.js';
import { ensureAnonymousAuth } from '../firebase/auth.js';

/** Clear tracked waiting room only when it is still one of the ids we plan to abandon. */
export function clearTrackedWaitingRoomIfAbandoned(gameIds: readonly string[]): void {
  const abandonSet = new Set(gameIds.map((id) => id.toUpperCase()));
  const current = getOrganizerWaitingRoom();
  if (current && abandonSet.has(current.toUpperCase())) {
    takeOrganizerWaitingRoom();
  }
}

/** Clear draft publish pointer only when it still points at a room we just abandoned. */
export function clearPublishedGameIdIfAbandoned(draftId: string, gameIds: readonly string[]): void {
  const abandonSet = new Set(gameIds.map((id) => id.toUpperCase()));
  const current = getLocalRoomDraft(draftId)?.publishedGameId;
  if (current && abandonSet.has(current.toUpperCase())) {
    updateLocalRoomDraft(draftId, { publishedGameId: null });
  }
}

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

/** Collect in-memory waiting room ids that may need Firebase cleanup for a draft. */
export function collectWaitingRoomsToAbandon(draftId: string): string[] {
  const gameIds = new Set<string>();
  const tracked = getOrganizerWaitingRoom();
  if (tracked) {
    gameIds.add(tracked);
  }
  const draft = getLocalRoomDraft(draftId);
  if (draft?.publishedGameId) {
    gameIds.add(draft.publishedGameId);
  }
  return [...gameIds];
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
 * Skips Auth/RTDB when nothing is tracked or published (pure local training).
 */
export async function abandonOrganizerWaitingRoomForDraft(draftId: string): Promise<void> {
  const gameIds = collectWaitingRoomsToAbandon(draftId);
  if (gameIds.length === 0) {
    return;
  }

  const user = await ensureAnonymousAuth();
  if (!user?.uid) {
    return;
  }

  // Clear only if tracked is still one of the peeked ids. A concurrent
  // setOrganizerWaitingRoom(NEW) during Auth must not be wiped by a blind take().
  clearTrackedWaitingRoomIfAbandoned(gameIds);
  for (const gameId of gameIds) {
    await abandonWaitingRoomSession(gameId, user.uid);
  }
  clearPublishedGameIdIfAbandoned(draftId, gameIds);
}
