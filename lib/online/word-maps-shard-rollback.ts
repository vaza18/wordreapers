import { ref, remove } from 'firebase/database';

import { sessionWordPlayersPerWordPath } from '../firebase/paths.js';
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

/** Best-effort undo after session/player_words write fails post-shard commit. */
export async function rollbackWordMapsShard(
  gameId: string,
  normalized: string,
  uid: string,
): Promise<void> {
  try {
    await remove(wordPlayersShardPlayerRef(gameId, normalized, uid));
  } catch {
    // Best-effort cleanup.
  }
}

export { wordPlayersPerWordRef, wordPlayersShardPlayerRef };
