import { get } from 'firebase/database';

import { rematchFinishedSessionToWaiting } from '../../firebase/game-session-service.js';
import { sessionRef } from '../../firebase/session-ref.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';

import { bootstrapRematchWaitingFromArchive } from './bootstrap-rematch-waiting-from-archive.js';
import { planRematchAction } from './plan-rematch-action.js';
import { resolveRematchRtdbPresence } from '../orphan-game-session.js';

/**
 * Start rematch. Any rostered participant can reopen the room from local archive or a live `finished` session.
 */
export async function restartRematchOnlineRound(
  gameId: string,
  actorUid: string,
  baseWordRound: number,
): Promise<void> {
  const normalized = normalizeRoomCode(gameId);
  // Permission-denied must not be treated as «missing» — App Check / auth glitches
  // would otherwise bootstrap from archive and race an active room (rules allow
  // reading absent roots; PD means the read failed, not that the room is gone).
  const snapshot = await get(sessionRef(normalized));
  const raw: unknown = snapshot.exists() ? snapshot.val() : null;
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
