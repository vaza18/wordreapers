import { get } from 'firebase/database';

import { canRematchAfterRound } from '../../../constants/max-rounds-per-room.js';
import { rematchFinishedSessionToWaiting } from '../../firebase/game-session-service.js';
import { sessionRef } from '../../firebase/session-ref.js';
import { getServerNow } from '../../firebase/server-clock.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import type { GameSession } from '../../firebase/types.js';

import { bootstrapRematchWaitingFromArchive } from './bootstrap-rematch-waiting-from-archive.js';
import { planRematchAction } from './plan-rematch-action.js';
import { resolveRematchRtdbPresence } from '../orphan-game-session.js';
import { ensureSessionFinishedForResults } from '../ensure-session-finished-for-results.js';

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
 * During finish-submit grace the UI is expired but finish is still no-op — poll via
 * {@link ensureSessionFinishedForResults} instead of failing on the first attempt.
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

  // Join an already-open legal lobby is always allowed; bump/bootstrap is not after the final round.
  if (action === 'bootstrap' || action === 'restart_finished') {
    if (!canRematchAfterRound(baseWordRound)) {
      throw new Error('REMATCH_FAILED');
    }
  }

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
    // UI-expired may still be inside finish grace — wait for finished/waiting, do not
    // treat a single false finishGameSessionIfExpired as REMATCH_FAILED.
    const ensureOutcome = await ensureSessionFinishedForResults(gameId, {
      expectedBaseWordRound: live.baseWordRound ?? 0,
    });
    if (ensureOutcome === 'timeout') {
      throw new Error('REMATCH_FAILED');
    }
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
