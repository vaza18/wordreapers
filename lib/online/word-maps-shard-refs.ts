import { ref } from 'firebase/database';

import { sessionWordPlayersPerWordPath } from '../firebase/paths.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { normalizeRoomCode } from '../firebase/room-code.js';

/** Parent node `session_word_maps/{gameId}/wordPlayers/{normalized}`. */
export function wordPlayersPerWordRef(gameId: string, normalized: string) {
  return ref(
    getFirebaseDatabase(),
    sessionWordPlayersPerWordPath(normalizeRoomCode(gameId), normalized),
  );
}

/** Leaf `session_word_maps/{gameId}/wordPlayers/{normalized}/{uid}` (append-only while playing). */
export function wordPlayersShardPlayerRef(gameId: string, normalized: string, uid: string) {
  return ref(
    getFirebaseDatabase(),
    `${sessionWordPlayersPerWordPath(normalizeRoomCode(gameId), normalized)}/${uid}`,
  );
}
