import { get, set } from 'firebase/database';

import {
  clearSessionRootForRecreate,
  rematchFinishedSessionToWaiting,
} from '../../firebase/game-session-service.js';
import { sessionRef } from '../../firebase/session-ref.js';
import { isFirebasePermissionDenied } from '../../firebase/rtdb-errors.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';

import { buildRematchWaitingSession } from './build-rematch-waiting-session.js';
import { clearAllActiveRoundCachesForGame } from '../session/active-round-cache.js';
import { isOrphanGameSessionShell } from '../orphan-game-session.js';
import { getFinishedRoundArchive } from '../session/online-session-archive.js';
import { setOrganizerWaitingRoom } from '../organizer-waiting-room.js';

async function readWaitingSessionIfPresent(gameId: string): Promise<GameSession | null> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    return null;
  }
  const raw = snapshot.val();
  if (isOrphanGameSessionShell(raw)) {
    return null;
  }
  const session = raw as GameSession;
  if (session.status === 'waiting') {
    return session;
  }
  return null;
}

async function finalizeBootstrapSuccess(
  gameId: string,
  actorUid: string,
  organizerId: string,
  session: GameSession,
): Promise<GameSession> {
  const normalized = normalizeRoomCode(gameId);
  await clearAllActiveRoundCachesForGame(normalized);
  if (actorUid === organizerId) {
    setOrganizerWaitingRoom(normalized);
  }
  return session;
}

/** Create `waiting` only when the root is empty; reuse peer work otherwise. */
async function acquireRematchWaitingSession(
  gameId: string,
  actorUid: string,
  bootstrapSession: GameSession,
  organizerId: string,
): Promise<GameSession> {
  const normalized = normalizeRoomCode(gameId);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clearSessionRootForRecreate(normalized, actorUid);

    const waiting = await readWaitingSessionIfPresent(normalized);
    if (waiting) {
      return waiting;
    }

    const snapshot = await get(sessionRef(normalized));
    if (!snapshot.exists()) {
      try {
        await set(sessionRef(normalized), bootstrapSession);
        return finalizeBootstrapSuccess(normalized, actorUid, organizerId, bootstrapSession);
      } catch (error) {
        if (!isFirebasePermissionDenied(error)) {
          throw error;
        }
        const peerWaiting = await readWaitingSessionIfPresent(normalized);
        if (peerWaiting) {
          return peerWaiting;
        }
        continue;
      }
    }

    const raw = snapshot.val();
    if (isOrphanGameSessionShell(raw)) {
      continue;
    }

    const existing = raw as GameSession;
    if (existing.status === 'waiting') {
      return existing;
    }
    if (existing.status === 'finished') {
      await rematchFinishedSessionToWaiting(normalized, actorUid);
      const peerWaiting = await readWaitingSessionIfPresent(normalized);
      if (peerWaiting) {
        return peerWaiting;
      }
      continue;
    }

    throw new Error('REMATCH_FAILED');
  }

  const peerWaiting = await readWaitingSessionIfPresent(normalized);
  if (peerWaiting) {
    return peerWaiting;
  }
  throw new Error('REMATCH_FAILED');
}

/**
 * Recreate a deleted session directly in `waiting` for rematch.
 * Skips restoring `player_words` — the next round starts with empty word lists.
 */
export async function bootstrapRematchWaitingFromArchive(
  gameId: string,
  actorUid: string,
  baseWordRound: number,
): Promise<GameSession> {
  const archive = await getFinishedRoundArchive(gameId, baseWordRound);
  if (!archive) {
    throw new Error('NO_FINISHED_ARCHIVE');
  }
  if (!archive.session.players[actorUid]) {
    throw new Error('REMATCH_FAILED');
  }
  if (!archive.session.players[archive.session.organizerId]) {
    throw new Error('REMATCH_FAILED');
  }

  const bootstrapSession = buildRematchWaitingSession(archive.session, actorUid);
  return acquireRematchWaitingSession(
    gameId,
    actorUid,
    bootstrapSession,
    archive.session.organizerId,
  );
}
