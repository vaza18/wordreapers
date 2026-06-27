import * as admin from 'firebase-admin';

/** Must match client `FINISHED_RETENTION_MS` in lib/firebase/session-purge.ts */
export const FINISHED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

interface GameSessionNode {
  status?: string;
  purgeAfterAt?: number | null;
  players?: Record<string, unknown>;
}

export interface PurgeResult {
  scanned: number;
  purged: number;
}

/**
 * Delete game_sessions + session_word_maps + player_words when purgeAfterAt has passed.
 * Admin SDK bypasses RTDB security rules.
 */
export async function purgeExpiredRtdbSessions(now = Date.now()): Promise<PurgeResult> {
  const db = admin.database();
  const sessionsSnap = await db
    .ref('game_sessions')
    .orderByChild('purgeAfterAt')
    .endAt(now)
    .once('value');
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
    const session = child.val() as GameSessionNode;
    const purgeAfterAt = session.purgeAfterAt;
    if (typeof purgeAfterAt !== 'number' || purgeAfterAt > now) {
      return;
    }

    purged += 1;
    purgePromises.push(purgeGameSession(db, gameId, session.players ?? {}));
  });

  await Promise.all(purgePromises);
  return { scanned, purged };
}

/** Remove one finished session and all related RTDB nodes. */
async function purgeGameSession(
  db: admin.database.Database,
  gameId: string,
  players: Record<string, unknown>,
): Promise<void> {
  const updates: Record<string, null> = {
    [`game_sessions/${gameId}`]: null,
    [`session_word_maps/${gameId}`]: null,
  };
  for (const playerId of Object.keys(players)) {
    updates[`player_words/${gameId}/${playerId}`] = null;
  }
  await db.ref().update(updates);
}
