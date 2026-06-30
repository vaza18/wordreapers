import { get, ref } from 'firebase/database';

import { rematchFinishedSessionToWaiting } from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { isFirebasePermissionDenied } from '../firebase/rtdb-errors.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

import { bootstrapRematchWaitingFromArchive } from './bootstrap-rematch-waiting-from-archive.js';
import { planRematchAction } from './plan-rematch-action.js';
import { resolveRematchRtdbPresence } from './orphan-game-session.js';

function sessionRef(gameId: string) {
  return ref(getFirebaseDatabase(), gameSessionPath(normalizeRoomCode(gameId)));
}

/**
 * Start rematch. Any rostered participant can reopen the room from local archive or a live `finished` session.
 */
export async function restartRematchOnlineRound(
  gameId: string,
  actorUid: string,
  baseWordRound: number,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  let raw: unknown = null;
  try {
    const snapshot = await get(sessionRef(normalized));
    raw = snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    if (!isFirebasePermissionDenied(error)) {
      throw error;
    }
  }
  const presence = resolveRematchRtdbPresence(raw);
  const action = planRematchAction(presence);

  if (action === 'bootstrap') {
    await bootstrapRematchWaitingFromArchive(gameId, actorUid, baseWordRound);
    return;
  }

  if (action === 'join_waiting' || action === 'join_live') {
    return;
  }
  if (action === 'failed') {
    throw new Error('REMATCH_FAILED');
  }

  await rematchFinishedSessionToWaiting(gameId, actorUid);
}
