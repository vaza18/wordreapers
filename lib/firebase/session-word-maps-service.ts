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
import { devLogAction } from '../debug/dev-log.js';

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

/** Discriminated one-shot read — errors are not coerced to empty maps. */
export type SessionWordMapsFetchResult =
  { ok: true; maps: SessionWordMaps } | { ok: false; error: unknown };

export async function tryFetchSessionWordMaps(gameId: string): Promise<SessionWordMapsFetchResult> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await ensureAnonymousAuth();
    const snapshot = await get(sessionWordMapsRef(roomId));
    if (!snapshot.exists()) {
      return { ok: true, maps: { ...EMPTY_SESSION_WORD_MAPS } };
    }
    return { ok: true, maps: parseSessionWordMaps(snapshot.val()) };
  } catch (error) {
    return { ok: false, error };
  }
}

/** One-shot read that throws on network/permission failure (never coerces to empty). */
export async function requireSessionWordMaps(gameId: string): Promise<SessionWordMaps> {
  const result = await tryFetchSessionWordMaps(gameId);
  if (!result.ok) {
    throw result.error instanceof Error
      ? result.error
      : new Error(String(result.error) || 'session word maps fetch failed');
  }
  return result.maps;
}

/** Live maps event: real RTDB snapshots vs permission/network unavailability. */
export type SessionWordMapsListenEvent =
  | { type: 'snapshot'; maps: SessionWordMaps }
  | { type: 'unavailable'; reason: 'permission_denied' | 'error' };

/** Live word maps (overlap, uniqueness, standings recompute). */
export function subscribeSessionWordMaps(
  gameId: string,
  listener: (event: SessionWordMapsListenEvent) => void,
): Unsubscribe {
  const roomId = normalizeRoomCode(gameId);
  return onValue(
    sessionWordMapsRef(roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ type: 'snapshot', maps: { ...EMPTY_SESSION_WORD_MAPS } });
        return;
      }
      listener({ type: 'snapshot', maps: parseSessionWordMaps(snapshot.val()) });
    },
    (error) => {
      if (isFirebasePermissionDenied(error)) {
        listener({ type: 'unavailable', reason: 'permission_denied' });
        return;
      }
      devLogAction('subscribeSessionWordMaps failed', {
        level: 'detail',
        room: roomId,
        details: error instanceof Error ? error.message : String(error),
      });
      listener({ type: 'unavailable', reason: 'error' });
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
    devLogAction('clearSessionWordMaps failed', {
      level: 'detail',
      room: roomId,
      details: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Clear maps and verify empty before `waiting → playing`.
 * Fail-loud so play clients never latch `awaitingEmptySync` against uncleared prior-round words.
 */
export async function ensureSessionWordMapsEmptyForRoundStart(gameId: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clearSessionWordMaps(roomId);
    const result = await tryFetchSessionWordMaps(roomId);
    if (!result.ok) {
      // Permission/network: cannot prove empty — fail start rather than enter polluted play.
      throw result.error instanceof Error
        ? result.error
        : new Error('SESSION_WORD_MAPS_CLEAR_UNVERIFIED');
    }
    if (Object.keys(result.maps.wordPlayers ?? {}).length === 0) {
      return;
    }
  }
  throw new Error('SESSION_WORD_MAPS_NOT_CLEARED');
}

export { sessionWordMapsRef };
