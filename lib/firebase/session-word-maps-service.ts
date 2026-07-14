import {
  get,
  onValue,
  ref,
  remove,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

import { getFirebaseDatabase } from './init.js';
import { ensureAnonymousAuth } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { sessionWordMapsPath } from './paths.js';
import { normalizeRoomCode } from './room-code.js';
import { EMPTY_SESSION_WORD_MAPS, type SessionWordMaps } from './session-word-maps.js';

function sessionWordMapsRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), sessionWordMapsPath(gameId));
}

function parseSessionWordMaps(raw: unknown): SessionWordMaps {
  if (raw == null || typeof raw !== 'object') {
    return { ...EMPTY_SESSION_WORD_MAPS };
  }
  const value = raw as SessionWordMaps;
  return {
    wordPlayers: value.wordPlayers ?? {},
  };
}

/** One-shot read of shared word maps for a room (requires roster membership in RTDB rules). */
export async function fetchSessionWordMaps(gameId: string): Promise<SessionWordMaps> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await ensureAnonymousAuth();
    const snapshot = await get(sessionWordMapsRef(roomId));
    if (!snapshot.exists()) {
      return { ...EMPTY_SESSION_WORD_MAPS };
    }
    return parseSessionWordMaps(snapshot.val());
  } catch (error) {
    if (__DEV__) {
      console.warn('fetchSessionWordMaps', error);
    }
    return { ...EMPTY_SESSION_WORD_MAPS };
  }
}

/** Live word maps (overlap, uniqueness, standings recompute). */
export function subscribeSessionWordMaps(
  gameId: string,
  listener: (maps: SessionWordMaps | null) => void,
): Unsubscribe {
  const roomId = normalizeRoomCode(gameId);
  return onValue(
    sessionWordMapsRef(roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ ...EMPTY_SESSION_WORD_MAPS });
        return;
      }
      listener(parseSessionWordMaps(snapshot.val()));
    },
    (error) => {
      if (isFirebasePermissionDenied(error)) {
        listener({ ...EMPTY_SESSION_WORD_MAPS });
        return;
      }
      if (__DEV__) {
        console.warn('subscribeSessionWordMaps', error);
      }
      listener(null);
    },
  );
}

/** Write per-word shards (RTDB rules deny bulk root writes on `session_word_maps`). */
export async function writeSessionWordMapsShards(
  gameId: string,
  maps: SessionWordMaps,
): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  const payload: Record<string, boolean> = {};
  for (const [normalized, playersOnWord] of Object.entries(maps.wordPlayers ?? {})) {
    for (const [uid, onWord] of Object.entries(playersOnWord)) {
      if (onWord) {
        payload[`wordPlayers/${normalized}/${uid}`] = true;
      }
    }
  }
  if (Object.keys(payload).length === 0) {
    return;
  }
  await update(sessionWordMapsRef(roomId), payload);
}

/** Clear word maps on rematch / new round start. */
export async function clearSessionWordMaps(gameId: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await remove(sessionWordMapsRef(roomId));
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    if (__DEV__) {
      console.warn('clearSessionWordMaps', error);
    }
  }
}

export { sessionWordMapsRef };
