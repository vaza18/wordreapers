import { get, ref } from 'firebase/database';

import { abandonWaitingGameSession } from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { fetchSessionPlayerWords } from '../firebase/player-words-service.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import type { GameSession } from '../firebase/types.js';
import { buildStandingsFromSession } from '../game/scoring.js';

import type { AllPlayerWords } from './session/clone-player-words.js';
import { persistLocalArchive } from './coordinated-session-cleanup.js';
import { finalizeOnlineRoundForPlayer } from './finalize-online-round.js';
import {
  clearPendingRoundArchive,
  listPendingRoundArchives,
} from './session/pending-round-archive.js';
import {
  getFinishedRoundArchive,
  isFinishedArchiveStale,
  listFinishedRoundArchives,
  markFinishedArchiveAckSent,
} from './session/online-session-archive.js';
import { allSessionPlayersOffline } from './presence/session-offline.js';
import { notifyRoundFinishedOnce } from './round-finished-notification-once.js';
import {
  buildSyncWorkQueue,
  type SyncCoordinatorContext,
  type SyncWorkItem,
} from './sync-work-queue.js';

export {
  SYNC_COORDINATOR_SCAN_LIMIT,
  buildSyncWorkQueue,
  type SyncCoordinatorContext,
  type SyncWorkItem,
} from './sync-work-queue.js';

async function readSession(gameId: string): Promise<GameSession | null> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(normalized)));
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val() as GameSession;
}

async function persistArchiveIfNeeded(
  gameId: string,
  uid: string,
  session: GameSession,
): Promise<void> {
  const baseWordRound = session.baseWordRound ?? 0;
  const existing = await getFinishedRoundArchive(gameId, baseWordRound);
  const standings = buildStandingsFromSession(session);

  if (existing && !isFinishedArchiveStale(existing, session)) {
    if (existing.ackSent !== true) {
      await markFinishedArchiveAckSent(gameId, baseWordRound);
    }
    await finalizeOnlineRoundForPlayer(gameId, baseWordRound, uid, standings);
    return;
  }

  const playerIds = Object.keys(session.players);
  const words: AllPlayerWords = await fetchSessionPlayerWords(gameId, playerIds);
  await persistLocalArchive(gameId, uid, session, words);
  await finalizeOnlineRoundForPlayer(gameId, baseWordRound, uid, standings);
}

async function tryAbandonStaleWaitingRoom(
  gameId: string,
  session: GameSession,
  uid?: string,
): Promise<void> {
  if (session.status !== 'waiting' || !uid || session.organizerId !== uid) {
    return;
  }
  if (!allSessionPlayersOffline(session)) {
    return;
  }
  await abandonWaitingGameSession(gameId, uid);
}

async function syncWorkItem(item: SyncWorkItem, context: SyncCoordinatorContext): Promise<void> {
  const normalized = normalizeRoomCode(item.gameId);
  if (context.activePlayGameId && normalizeRoomCode(context.activePlayGameId) === normalized) {
    return;
  }
  if (
    context.activeResultsGameId &&
    normalizeRoomCode(context.activeResultsGameId) === normalized
  ) {
    return;
  }

  const session = await readSession(item.gameId);
  if (!session) {
    if (item.fromPending) {
      const existing = await getFinishedRoundArchive(item.gameId, item.baseWordRound);
      if (existing) {
        await clearPendingRoundArchive(item.gameId, item.baseWordRound);
        void notifyRoundFinishedOnce(item.gameId, item.baseWordRound, existing.session.baseWord);
      }
    }
    return;
  }

  const uid = item.uid ?? context.uid;

  if (session.status === 'waiting') {
    await tryAbandonStaleWaitingRoom(item.gameId, session, uid);
    return;
  }

  if (session.status === 'playing') {
    return;
  }

  if (session.status !== 'finished') {
    return;
  }

  if ((session.baseWordRound ?? 0) !== item.baseWordRound) {
    if (item.fromPending) {
      await clearPendingRoundArchive(item.gameId, item.baseWordRound);
    }
    return;
  }

  if (item.fromPending) {
    void notifyRoundFinishedOnce(item.gameId, item.baseWordRound, session.baseWord);
  }

  if (uid && session.players[uid]) {
    await persistArchiveIfNeeded(item.gameId, uid, session);
    if (item.fromPending) {
      await clearPendingRoundArchive(item.gameId, item.baseWordRound);
    }
  }
}

/**
 * Scan recent local history + pending queue and backfill stale archives.
 */
export async function syncFinishedRoundsCoordinator(
  context: SyncCoordinatorContext = {},
): Promise<void> {
  const pending = await listPendingRoundArchives();
  const recent = await listFinishedRoundArchives();
  const queue = buildSyncWorkQueue(pending, recent, context.uid);

  for (const item of queue) {
    try {
      await syncWorkItem(item, context);
    } catch (error) {
      if (__DEV__) {
        console.warn('syncFinishedRoundsCoordinator', item.gameId, error);
      }
    }
  }
}
