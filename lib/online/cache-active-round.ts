import { get, ref } from 'firebase/database';

import { getFirebaseDatabase } from '../firebase/init.js';
import { gameSessionPath } from '../firebase/paths.js';
import {
  restorePlayerWordsToFirebase,
  reconcileOwnPlayerWordsWithSession,
  getOwnPlayerWords,
  type StoredPlayerWord,
} from '../firebase/player-words-service.js';
import { getServerNow } from '../firebase/server-clock.js';
import { normalizeRoomCode } from '../firebase/room-code.js';
import type { GameSession } from '../firebase/types.js';

import {
  getActiveRoundCache,
  purgeExpiredActiveRoundCaches,
  removeActiveRoundCache,
  saveActiveRoundCache,
  wordsMapFromCache,
  wordsRecordFromMap,
} from './active-round-cache.js';
import { playingRoundSnapshotFromSession } from './online-session-archive.js';

/**
 * Backup word list locally for rejoin (RTDB is left intact so results/scores stay correct).
 */
export async function cacheActiveRoundProgress(
  gameId: string,
  _uid: string,
  session: GameSession,
  words: Map<string, StoredPlayerWord>,
): Promise<void> {
  if (session.status !== 'playing' || session.timerEndsAt == null || words.size === 0) {
    return;
  }
  await saveActiveRoundCache({
    gameId,
    baseWordRound: session.baseWordRound ?? 0,
    timerEndsAt: session.timerEndsAt,
    words: wordsRecordFromMap(words),
    sessionSnapshot: playingRoundSnapshotFromSession(session) ?? undefined,
  });
}

/**
 * Restore cached words when rejoining before the round timer ends.
 */
export async function tryRestoreActiveRoundCache(
  gameId: string,
  uid: string,
  session: GameSession,
  firebaseWordCount: number,
): Promise<void> {
  try {
    const roomId = normalizeRoomCode(gameId);
    if (session.status !== 'playing' || session.timerEndsAt == null) {
      return;
    }

    if (firebaseWordCount > 0 && (session.players[uid]?.wordCount ?? 0) === 0) {
      const words = await getOwnPlayerWords(gameId, uid);
      await reconcileOwnPlayerWordsWithSession(gameId, uid, session, words);
      return;
    }

    if (firebaseWordCount > 0) {
      return;
    }
    const serverNow = getServerNow();
    if (serverNow >= session.timerEndsAt) {
      await removeActiveRoundCache(gameId, session.baseWordRound ?? 0);
      return;
    }

    const cached = await getActiveRoundCache(gameId, session.baseWordRound ?? 0);
    if (!cached || cached.timerEndsAt !== session.timerEndsAt) {
      return;
    }

    const map = wordsMapFromCache(cached);
    if (map.size === 0) {
      return;
    }

    const freshSnapshot = await get(ref(getFirebaseDatabase(), gameSessionPath(roomId)));
    if (!freshSnapshot.exists()) {
      await removeActiveRoundCache(gameId, session.baseWordRound ?? 0);
      return;
    }
    const freshSession = freshSnapshot.val() as GameSession;
    if (
      freshSession.status !== 'playing' ||
      freshSession.timerEndsAt == null ||
      freshSession.timerEndsAt !== session.timerEndsAt ||
      (freshSession.baseWordRound ?? 0) !== (session.baseWordRound ?? 0)
    ) {
      return;
    }

    await restorePlayerWordsToFirebase(gameId, uid, map);
  } catch (error) {
    if (__DEV__) {
      console.warn('tryRestoreActiveRoundCache', error);
    }
  }
}

export async function purgeStaleActiveRoundCaches(): Promise<void> {
  await purgeExpiredActiveRoundCaches(getServerNow());
}

export async function clearActiveRoundCacheForSession(
  gameId: string,
  baseWordRound: number,
): Promise<void> {
  await removeActiveRoundCache(gameId, baseWordRound);
}
