import { normalizeRoomCode } from '../firebase/room-code.js';

import type { FinishedRoundArchive } from './online-session-archive.js';
import type { PendingRoundArchive } from './pending-round-archive.js';

export const SYNC_COORDINATOR_SCAN_LIMIT = 10;

export interface SyncWorkItem {
  gameId: string;
  baseWordRound: number;
  uid?: string;
  fromPending: boolean;
}

export interface SyncCoordinatorContext {
  uid?: string;
  /** Skip sync/cleanup for this game while on the live play screen. */
  activePlayGameId?: string | null;
  /** Skip RTDB delete while viewing results (rematch window). */
  activeResultsGameId?: string | null;
}

/** Merge pending entries and the newest local finished archives into a deduped work queue. */
export function buildSyncWorkQueue(
  pending: PendingRoundArchive[],
  recentArchives: FinishedRoundArchive[],
  uid?: string,
): SyncWorkItem[] {
  const byKey = new Map<string, SyncWorkItem>();

  for (const entry of pending) {
    const key = `${normalizeRoomCode(entry.gameId)}:${entry.baseWordRound}`;
    byKey.set(key, {
      gameId: entry.gameId,
      baseWordRound: entry.baseWordRound,
      uid: entry.uid,
      fromPending: true,
    });
  }

  for (const archive of recentArchives.slice(0, SYNC_COORDINATOR_SCAN_LIMIT)) {
    const key = `${normalizeRoomCode(archive.gameId)}:${archive.baseWordRound}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        gameId: archive.gameId,
        baseWordRound: archive.baseWordRound,
        uid,
        fromPending: false,
      });
    }
  }

  return [...byKey.values()];
}
