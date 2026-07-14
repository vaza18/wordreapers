import * as admin from 'firebase-admin';

/** Must match client `FINISHED_RETENTION_MS` in lib/firebase/session-purge.ts */
export const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Retention for abandoned waiting/playing rooms without a future purgeAfterAt. */
export const ABANDONED_RETENTION_MS = FINISHED_RETENTION_MS;

export interface GameSessionPurgeNode {
  status?: string;
  purgeAfterAt?: number | null;
  createdAt?: number | null;
  roundStartedAt?: number | null;
  players?: Record<string, unknown>;
}

export interface PurgeResult {
  scanned: number;
  purged: number;
}

/** Finished sessions past purgeAfterAt. */
export function shouldPurgeFinishedSession(session: GameSessionPurgeNode, now: number): boolean {
  const purgeAfterAt = session.purgeAfterAt;
  return typeof purgeAfterAt === 'number' && purgeAfterAt <= now;
}

/**
 * Abandoned waiting/playing (or finished without TTL) rooms eligible for purge.
 * Missing createdAt → purge immediately (pre-migration / orphan shells with status).
 */
export function shouldPurgeAbandonedSession(
  session: GameSessionPurgeNode,
  now: number,
  retentionMs = ABANDONED_RETENTION_MS,
): boolean {
  if (shouldPurgeFinishedSession(session, now)) {
    return false;
  }
  if (typeof session.purgeAfterAt === 'number' && session.purgeAfterAt > now) {
    return false;
  }

  const status = session.status;
  if (status === 'finished') {
    // Finished but missing/null purgeAfterAt — sweep as abandoned.
    return typeof session.purgeAfterAt !== 'number';
  }
  if (status !== 'waiting' && status !== 'playing') {
    return false;
  }

  if (typeof session.createdAt !== 'number') {
    return true;
  }

  if (status === 'waiting') {
    return session.createdAt + retentionMs <= now;
  }

  const anchor =
    typeof session.roundStartedAt === 'number' ? session.roundStartedAt : session.createdAt;
  return anchor + retentionMs <= now;
}

/** True when finished TTL or abandoned waiting/playing retention has elapsed. */
export function shouldPurgeSession(session: GameSessionPurgeNode, now: number): boolean {
  return shouldPurgeFinishedSession(session, now) || shouldPurgeAbandonedSession(session, now);
}

/**
 * Delete game_sessions + session_word_maps + player_words when retention has passed.
 * Admin SDK bypasses RTDB security rules.
 */
export async function purgeExpiredRtdbSessions(
  now = Date.now(),
  db: admin.database.Database = admin.database(),
): Promise<PurgeResult> {
  const sessionsSnap = await db.ref('game_sessions').once('value');
  if (!sessionsSnap.exists()) {
    return { scanned: 0, purged: 0 };
  }

  let scanned = 0;
  let purged = 0;
  const purgePromises: Promise<void>[] = [];

  sessionsSnap.forEach((child) => {
    scanned += 1;
    const gameId = child.key;
    if (!gameId) {
      return;
    }
    const session = child.val() as GameSessionPurgeNode;
    if (!shouldPurgeSession(session, now)) {
      return;
    }
    purged += 1;
    purgePromises.push(purgeGameSession(db, gameId));
  });

  await Promise.all(purgePromises);
  return { scanned, purged };
}

/** Remove one session and all related RTDB nodes. */
export async function purgeGameSession(db: admin.database.Database, gameId: string): Promise<void> {
  const updates: Record<string, null> = {
    [`game_sessions/${gameId}`]: null,
    [`session_word_maps/${gameId}`]: null,
    [`player_words/${gameId}`]: null,
  };
  await db.ref().update(updates);
}
