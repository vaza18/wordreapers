import { get, ref, set } from 'firebase/database';

import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath, playerWordsPath } from '../firebase/paths.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import { sessionWordMapsRef } from '../firebase/session-word-maps-service.js';
import {
  sessionWordMapsFromSession,
  stripWordMapsFromSession,
} from '../firebase/session-word-maps.js';
import type { GameSession } from '../firebase/types.js';

import { getFinishedRoundArchive } from './online-session-archive.js';

function sessionRef(gameId: string) {
  return ref(getFirebaseDatabase(), gameSessionPath(normalizeRoomCode(gameId)));
}

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
  if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
    await set(sessionWordMapsRef(normalized), wordMaps);
  }

  await Promise.all(
    Object.entries(archive.playerWords).map(async ([playerId, words]) => {
      if (Object.keys(words).length === 0) {
        return;
      }
      await set(ref(getFirebaseDatabase(), playerWordsPath(normalized, playerId)), words);
    }),
  );

  return session;
}
