import { get } from 'firebase/database';

import { generateRoomCode } from './room-code.js';
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
  if (!preferredSnap.exists()) {
    return preferredCode;
  }
  const existing = preferredSnap.val() as GameSession;
  if (existing.organizerId === organizerUid) {
    return preferredCode;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateRoomCode();
    const snapshot = await get(sessionRef(code));
    if (!snapshot.exists()) {
      return code;
    }
  }
  throw new Error('Could not allocate room code');
}
