import { get, ref, set } from 'firebase/database';

import { getFirebaseDatabase } from './init.js';
import { gameSessionPath } from './paths.js';
import { sessionRef } from './session-ref.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { normalizeRoomCode } from './room-code.js';
import type { GameSession } from './types.js';

function resultsExitedRef(gameId: string, uid: string) {
  const normalized = normalizeRoomCode(gameId);
  return ref(getFirebaseDatabase(), `${gameSessionPath(normalized)}/resultsExitedBy/${uid}`);
}

async function readSession(gameId: string): Promise<GameSession | null> {
  const snapshot = await get(sessionRef(gameId));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

/**
 * Mark that this player left the results screen (metadata for rematch UX).
 */
export async function markResultsExited(gameId: string, uid: string): Promise<void> {
  const session = await readSession(gameId);
  if (
    !session ||
    !session.players?.[uid] ||
    (session.status !== 'finished' && session.status !== 'waiting')
  ) {
    return;
  }
  if (session.resultsExitedBy?.[uid] === true) {
    return;
  }

  try {
    await set(resultsExitedRef(gameId, uid), true);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    throw error;
  }
}
