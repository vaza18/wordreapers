import { get } from 'firebase/database';

import {
  finishGameSessionIfExpired,
  rematchFinishedSessionToWaiting,
} from '../../firebase/game-session-service.js';
import { sessionRef } from '../../firebase/session-ref.js';
import { getServerNow } from '../../firebase/server-clock.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';

import { bootstrapRematchWaitingFromArchive } from './bootstrap-rematch-waiting-from-archive.js';
import { planRematchAction } from './plan-rematch-action.js';
import { resolveRematchRtdbPresence } from '../orphan-game-session.js';

function isPlayingRoundExpired(session: GameSession): boolean {
  if (session.status !== 'playing' || session.timerEndsAt == null) {
    return false;
  }
  if (session.addTimeVote) {
    return false;
  }
  return getServerNow() >= session.timerEndsAt;
}

/**
 * Start rematch. Any rostered participant can reopen the room from local archive or a live `finished` session.
 * Stuck expired `playing` (finish write failed — LRAHP) is healed: finish then rematch.
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

  if (action === 'join_waiting') {
    // Latch + word cleanup only (AH2TN) — never rewrite an open rematch lobby.
    await rematchFinishedSessionToWaiting(gameId, actorUid);
    return;
  }

  if (action === 'join_live') {
    const live = raw as GameSession;
    if (!isPlayingRoundExpired(live)) {
      return;
    }
    await finishGameSessionIfExpired(gameId);
    const after = await get(sessionRef(normalized));
    if (!after.exists()) {
      throw new Error('REMATCH_FAILED');
    }
    const afterSession = after.val() as GameSession;
    if (afterSession.status === 'finished' || afterSession.status === 'waiting') {
      await rematchFinishedSessionToWaiting(gameId, actorUid);
      return;
    }
    throw new Error('REMATCH_FAILED');
  }

  await rematchFinishedSessionToWaiting(gameId, actorUid);
}
