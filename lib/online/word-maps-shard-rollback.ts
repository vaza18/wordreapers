import { ref, remove } from 'firebase/database';

import { playerWordLeafPath, sessionWordPlayersPerWordPath } from '../firebase/paths.js';
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

function playerWordLeafRef(gameId: string, uid: string, normalized: string) {
  return ref(getFirebaseDatabase(), playerWordLeafPath(normalizeRoomCode(gameId), uid, normalized));
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

/** Best-effort undo of player_words leaf (parallel wordSet may have committed). */
export async function rollbackPlayerWordLeaf(
  gameId: string,
  normalized: string,
  uid: string,
): Promise<void> {
  try {
    await remove(playerWordLeafRef(gameId, uid, normalized));
  } catch {
    // Best-effort cleanup.
  }
}

/** Compensating cleanup for shard + player_words after a partial submit failure. */
export async function rollbackWordSubmitArtifacts(
  gameId: string,
  normalized: string,
  uid: string,
): Promise<void> {
  await Promise.all([
    rollbackWordMapsShard(gameId, normalized, uid),
    rollbackPlayerWordLeaf(gameId, normalized, uid),
  ]);
}

export { wordPlayersPerWordRef, wordPlayersShardPlayerRef };
