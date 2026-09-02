import { get } from 'firebase/database';

import { generateRoomCode } from './room-code.js';
import { instrumentedSnapshotVal } from './rtdb-instrumentation.js';
import { sessionRef } from './session-ref.js';
import type { GameSession } from './types.js';

/**
 * Pick a free room code at publish time. Reuses `preferredCode` when empty or owned by the same organizer.
 */
export async function reserveUniqueRoomCode(
  preferredCode: string,
  organizerUid: string,
): Promise<string> {
  const preferredSnap = await get(sessionRef(preferredCode));
  const preferredVal = instrumentedSnapshotVal(preferredSnap); // record traffic
  if (!preferredSnap.exists()) {
    return preferredCode;
  }
  const existing = preferredVal as GameSession;
  if (existing.organizerId === organizerUid) {
    return preferredCode;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const snapshot = await get(sessionRef(code));
    if (!snapshot.exists()) {
      // Record traffic for the accepted code (snapshot.val() === null → 0 bytes, correct)
      instrumentedSnapshotVal(snapshot);
      return code;
    }
    // Record traffic for the rejected code
    instrumentedSnapshotVal(snapshot);
  }
  throw new Error('Could not allocate room code');
}
