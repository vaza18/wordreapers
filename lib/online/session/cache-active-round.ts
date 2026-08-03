import { getServerNow } from '../../firebase/server-clock.js';
import type { GameSession } from '../../firebase/types.js';

import {
  getActiveRoundCache,
  purgeExpiredActiveRoundCaches,
  removeActiveRoundCache,
  saveActiveRoundCache,
} from './active-round-cache.js';
import { playingRoundSnapshotFromSession } from './online-session-archive.js';
import { playableLexiconSnapshotForSession } from '../playable-lexicon-archive.js';
import { mergeOwnWordsIntoWordPlayers, mergeWordPlayersMaps } from '../word-players-invert.js';
import type { PlayableLexiconSnapshot } from '../../dictionary/round-playable-lexicon.js';

/**
 * Backup session snapshot + lexicon locally for rejoin
 * (`sessionSnapshot.wordPlayers` → RTDB shards; maps stay authoritative).
 * Merges `ownWords` into the snapshot so orphan restore keeps local submits
 * even if `session.wordPlayers` lags behind maps listeners.
 * Re-saving for the same timer unions prior cached wordPlayers so a poorer
 * exit path (e.g. left without maps) cannot wipe a richer play cache.
 * Pre-drop AsyncStorage shapes that only had a `words` field are not migrated.
 */
export async function cacheActiveRoundProgress(
  gameId: string,
  uid: string,
  session: GameSession,
  ownWords: ReadonlySet<string> | readonly string[] = [],
): Promise<void> {
  if (session.status !== 'playing' || session.timerEndsAt == null) {
    return;
  }
  const baseWordRound = session.baseWordRound ?? 0;
  const playableLexicon = playableLexiconSnapshotForSession(session);
  const baseSnapshot = playingRoundSnapshotFromSession(session);
  const existing = await getActiveRoundCache(gameId, baseWordRound);
  const sameRoundCache = existing && existing.timerEndsAt === session.timerEndsAt ? existing : null;

  if (!baseSnapshot && !playableLexicon && !sameRoundCache?.sessionSnapshot) {
    return;
  }

  let sessionSnapshot = baseSnapshot
    ? {
        ...baseSnapshot,
        wordPlayers: mergeOwnWordsIntoWordPlayers(baseSnapshot.wordPlayers, uid, ownWords),
      }
    : sameRoundCache?.sessionSnapshot
      ? {
          ...sameRoundCache.sessionSnapshot,
          wordPlayers: mergeOwnWordsIntoWordPlayers(
            sameRoundCache.sessionSnapshot.wordPlayers,
            uid,
            ownWords,
          ),
        }
      : undefined;

  if (sessionSnapshot && sameRoundCache?.sessionSnapshot?.wordPlayers) {
    sessionSnapshot = {
      ...sessionSnapshot,
      wordPlayers: mergeWordPlayersMaps(
        sameRoundCache.sessionSnapshot.wordPlayers,
        sessionSnapshot.wordPlayers,
      ),
    };
  }

  const lexiconToStore = playableLexicon ?? sameRoundCache?.playableLexicon;

  await saveActiveRoundCache({
    gameId,
    baseWordRound,
    timerEndsAt: session.timerEndsAt,
    sessionSnapshot,
    ...(lexiconToStore ? { playableLexicon: lexiconToStore } : {}),
  });
}

/** Load a persisted lexicon snapshot for the current playing round, if any. */
export async function loadActiveRoundLexiconSnapshot(
  gameId: string,
  session: GameSession,
): Promise<PlayableLexiconSnapshot | null> {
  if (session.status !== 'playing' || session.timerEndsAt == null) {
    return null;
  }
  const cached = await getActiveRoundCache(gameId, session.baseWordRound ?? 0);
  if (!cached || cached.timerEndsAt !== session.timerEndsAt) {
    return null;
  }
  const cachedBase = cached.sessionSnapshot?.baseWord;
  if (cachedBase && session.baseWord && cachedBase !== session.baseWord) {
    return null;
  }
  return cached.playableLexicon ?? null;
}

/** Drop local cache for this round once the live timer has ended. */
export async function clearExpiredActiveRoundCache(
  gameId: string,
  session: GameSession,
): Promise<void> {
  if (session.status !== 'playing' || session.timerEndsAt == null) {
    return;
  }
  if (getServerNow() < session.timerEndsAt) {
    return;
  }
  await removeActiveRoundCache(gameId, session.baseWordRound ?? 0);
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
