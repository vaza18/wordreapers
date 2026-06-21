import { get, ref, remove } from 'firebase/database';

import { sessionWordFirstPerWordPath, sessionWordPlayersPerWordPath } from '../firebase/paths.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

function wordPlayersPerWordRef(gameId: string, normalized: string) {
  return ref(
    getFirebaseDatabase(),
    sessionWordPlayersPerWordPath(normalizeRoomCode(gameId), normalized),
  );
}

function wordPlayersShardPlayerRef(gameId: string, normalized: string, uid: string) {
  return ref(
    getFirebaseDatabase(),
    `${sessionWordPlayersPerWordPath(normalizeRoomCode(gameId), normalized)}/${uid}`,
  );
}

function wordFirstPerWordRef(gameId: string, normalized: string) {
  return ref(
    getFirebaseDatabase(),
    sessionWordFirstPerWordPath(normalizeRoomCode(gameId), normalized),
  );
}

/** Best-effort undo after session/player_words write fails post-shard commit. */
export async function rollbackWordMapsShard(
  gameId: string,
  normalized: string,
  uid: string,
): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await remove(wordPlayersShardPlayerRef(roomId, normalized, uid));
  } catch {
    // Best-effort cleanup.
  }

  try {
    const snapshot = await get(wordPlayersPerWordRef(roomId, normalized));
    if (!snapshot.exists()) {
      await remove(wordFirstPerWordRef(roomId, normalized));
      return;
    }
    const playersOnWord = snapshot.val() as Record<string, boolean>;
    if (Object.keys(playersOnWord).length === 0) {
      await remove(wordFirstPerWordRef(roomId, normalized));
    }
  } catch {
    // Best-effort cleanup.
  }
}

export { wordPlayersPerWordRef, wordFirstPerWordRef };
