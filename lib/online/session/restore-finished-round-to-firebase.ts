import { get, set } from 'firebase/database';

import { sessionRef } from '../../firebase/session-ref.js';
import { normalizeRoomCode } from '../../firebase/room-code.js';
import {
  sessionWordMapsFromSession,
  stripWordMapsFromSession,
} from '../../firebase/session-word-maps.js';
import type { GameSession } from '../../firebase/types.js';

import { getFinishedRoundArchive } from './online-session-archive.js';
import { restoreSessionWordsToRtdb } from './restore-session-words-to-rtdb.js';

/**
 * Recreate a deleted `finished` session (+ words) from this device's local archive.
 */
export async function restoreFinishedRoundToFirebase(
  gameId: string,
  baseWordRound: number,
): Promise<GameSession> {
  const archive = await getFinishedRoundArchive(gameId, baseWordRound);
  if (!archive) {
    throw new Error('NO_FINISHED_ARCHIVE');
  }

  const normalized = normalizeRoomCode(gameId);
  const node = sessionRef(normalized);
  const existing = await get(node);
  if (existing.exists()) {
    const session = existing.val() as GameSession;
    if (session.status === 'finished' || session.status === 'waiting') {
      return session;
    }
    throw new Error('ROOM_NOT_RESTORABLE');
  }

  const session: GameSession = {
    ...stripWordMapsFromSession(archive.session),
    status: 'finished',
  };
  await set(node, session);

  const wordMaps = sessionWordMapsFromSession(archive.session);
  await restoreSessionWordsToRtdb(normalized, wordMaps, archive.playerWords);

  return session;
}
