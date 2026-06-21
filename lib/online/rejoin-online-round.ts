import { get, ref, set } from 'firebase/database';

import { ensureAnonymousAuth } from '../firebase/auth.js';
import { joinGameSession, type GameSessionSnapshot } from '../firebase/game-session-service.js';
import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import { getServerNow } from '../firebase/server-clock.js';
import { restorePlayerWordsToFirebase } from '../firebase/player-words-service.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import { sessionWordMapsRef } from '../firebase/session-word-maps-service.js';
import { sessionWordMapsFromSession } from '../firebase/session-word-maps.js';
import type { GameSession } from '../firebase/types.js';
import type { PlayerProfile } from '../profile/player-profile.js';

import {
  canRestorePlayingRoundFromCache,
  findActiveRoundCacheForGame,
  wordsMapFromCache,
} from './active-round-cache.js';
import { isOrphanGameSessionShell } from './orphan-game-session.js';
import type { PlayingRoundSnapshot } from './online-session-archive.js';
import { removeOrphanGameSessionShell } from '../firebase/game-session-service.js';

function sessionRef(gameId: string) {
  return ref(getFirebaseDatabase(), gameSessionPath(normalizeRoomCode(gameId)));
}

async function readSessionSnapshot(gameId: string): Promise<GameSessionSnapshot> {
  const normalized = normalizeRoomCode(gameId);
  const snapshot = await get(sessionRef(normalized));
  if (!snapshot.exists()) {
    throw new Error('ROOM_NOT_FOUND');
  }
  return { id: normalized, ...(snapshot.val() as GameSession) };
}

function sessionCoreFromSnapshot(snap: PlayingRoundSnapshot): GameSession {
  return {
    baseWord: snap.baseWord,
    status: 'playing',
    settings: snap.settings,
    timerEndsAt: snap.timerEndsAt,
    roundStartedAt: snap.roundStartedAt,
    roundTimerBudgetSeconds: snap.roundTimerBudgetSeconds,
    organizerId: snap.organizerId,
    players: snap.players,
    pauseState: snap.pauseState,
    baseWordPickerOrder: snap.baseWordPickerOrder,
    baseWordRound: snap.baseWordRound,
  };
}

/**
 * Recreate a deleted `playing` session from this device's parked round cache.
 */
export async function restorePlayingSessionFromLocalCache(
  gameId: string,
  uid: string,
): Promise<GameSessionSnapshot> {
  const serverNow = getServerNow();
  const entry = await findActiveRoundCacheForGame(gameId, serverNow);
  if (!canRestorePlayingRoundFromCache(entry, serverNow)) {
    throw new Error('NO_RESTORABLE_LOCAL_CACHE');
  }

  const normalized = normalizeRoomCode(gameId);
  const existing = await get(sessionRef(normalized));
  if (existing.exists()) {
    const raw = existing.val();
    if (isOrphanGameSessionShell(raw)) {
      const removed = await removeOrphanGameSessionShell(normalized, uid);
      if (!removed) {
        throw new Error('NO_RESTORABLE_LOCAL_CACHE');
      }
    } else {
      const session = raw as GameSession;
      if (session.status === 'finished') {
        throw new Error('ROUND_ALREADY_FINISHED');
      }
      if (session.status !== 'playing') {
        throw new Error('ROOM_NOT_JOINABLE');
      }
    }
  }
  const afterOrphan = await get(sessionRef(normalized));
  if (!afterOrphan.exists()) {
    await set(sessionRef(normalized), sessionCoreFromSnapshot(entry.sessionSnapshot));
    const wordMaps = sessionWordMapsFromSession(entry.sessionSnapshot);
    if (Object.keys(wordMaps.wordPlayers ?? {}).length > 0) {
      await set(sessionWordMapsRef(normalized), wordMaps);
    }
  }

  const words = wordsMapFromCache(entry);
  if (words.size > 0) {
    await restorePlayerWordsToFirebase(normalized, uid, words);
  }

  return readSessionSnapshot(normalized);
}

/**
 * Rejoin a round: use Firebase when the room exists, otherwise restore from local cache.
 */
export async function rejoinOnlineRound(
  gameId: string,
  profile: PlayerProfile,
): Promise<GameSessionSnapshot> {
  try {
    return await joinGameSession(gameId, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== 'ROOM_NOT_FOUND') {
      throw error;
    }
  }

  const user = await ensureAnonymousAuth();
  await restorePlayingSessionFromLocalCache(gameId, user.uid);
  return joinGameSession(gameId, profile);
}
