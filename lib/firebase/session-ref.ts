import { ref, type DatabaseReference } from 'firebase/database';

import { getFirebaseDatabase } from './init.js';
import { gameSessionPath } from './paths.js';
import { normalizeRoomCode } from './room-code.js';

/** RTDB reference to `game_sessions/{gameId}`. */
export function sessionRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPath(normalizeRoomCode(gameId)));
}
