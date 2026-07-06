import {
  get,
  onValue,
  ref,
  remove,
  set,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

import { runRtdbTransaction } from './rtdb-transaction.js';

import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '../game/scoring.js';

import {
  buildPartialWordMaps,
  planPlayerScoreUpdate,
  type PlayerScoreUpdatePlan,
} from '../online/apply-word-submit-to-session.js';
import type { SubmitWordProfile } from '../online/submit-word-profile.js';
import {
  rollbackWordMapsShard,
  wordFirstPerWordRef,
  wordPlayersPerWordRef,
  wordPlayersShardPlayerRef,
} from '../online/word-maps-shard-rollback.js';
import { wordsAreFromPreviousRound } from '../online/stale-player-words.js';

import { ensureAnonymousAuth } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { getFirebaseDatabase } from './init.js';
import {
  gameSessionPlayerPath,
  gameSessionPlayersPath,
  playerWordLeafPath,
  playerWordsPath,
} from './paths.js';
import { sessionRef } from './session-ref.js';
import { normalizeRoomCode } from './room-code.js';
import { globalWordCount } from './session-word-maps.js';
import type { GameSession, SessionWordMaps } from './types.js';

export {
  roundStartMsFromSession,
  wordsAreFromPreviousRound,
} from '../online/stale-player-words.js';

export interface StoredPlayerWord {
  display: string;
  at: number;
}

function playerWordRef(gameId: string, uid: string, normalized: string): DatabaseReference {
  return ref(getFirebaseDatabase(), playerWordLeafPath(gameId, uid, normalized));
}

function playerWordsRootRef(gameId: string, uid: string): DatabaseReference {
  return ref(getFirebaseDatabase(), playerWordsPath(gameId, uid));
}

function roomPlayerWordsRef(gameId: string): DatabaseReference {
  const roomId = normalizeRoomCode(gameId);
  return ref(getFirebaseDatabase(), `player_words/${roomId}`);
}

function sessionPlayersRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPlayersPath(gameId));
}

function sessionPlayerRef(gameId: string, uid: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPlayerPath(gameId, uid));
}

function parseStoredPlayerWord(raw: unknown): StoredPlayerWord | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as { display?: unknown; at?: unknown };
  if (typeof row.display !== 'string') {
    return null;
  }
  const at = typeof row.at === 'number' ? row.at : Date.now();
  return { display: row.display, at };
}

function parsePlayerWordsSnapshot(snapshot: {
  exists: () => boolean;
  val: () => unknown;
}): Map<string, StoredPlayerWord> {
  const map = new Map<string, StoredPlayerWord>();
  if (!snapshot.exists()) {
    return map;
  }
  const raw = snapshot.val() as Record<string, unknown>;
  for (const [key, value] of Object.entries(raw)) {
    const parsed = parseStoredPlayerWord(value);
    if (parsed) {
      map.set(key, parsed);
    }
  }
  return map;
}

/**
 * Remove all per-player word nodes (rematch or new round).
 */
export async function clearAllPlayerWords(
  gameId: string,
  playerIds?: readonly string[],
  actorUid?: string,
  organizerId?: string,
  options?: { everyPlayer?: boolean },
): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  let uids = playerIds;
  if (!uids?.length) {
    try {
      const snapshot = await get(roomPlayerWordsRef(roomId));
      if (!snapshot.exists()) {
        return;
      }
      uids = Object.keys(snapshot.val() as Record<string, unknown>);
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return;
      }
      throw error;
    }
  }
  const targets =
    options?.everyPlayer || actorUid == null || organizerId == null || actorUid === organizerId
      ? uids
      : uids.filter((uid) => uid === actorUid);
  await Promise.all(
    targets.map(async (uid) => {
      try {
        await remove(playerWordsRootRef(roomId, uid));
      } catch {
        // Best-effort: rules may deny once the session node is already gone.
      }
    }),
  );
}

export async function clearWaitingLobbyPlayerWordsAsOrganizer(
  gameId: string,
  session: Pick<GameSession, 'players' | 'organizerId' | 'status'>,
  organizerUid: string,
): Promise<void> {
  if (session.status !== 'waiting' || session.organizerId !== organizerUid) {
    return;
  }
  await clearAllPlayerWords(gameId, Object.keys(session.players), organizerUid, organizerUid, {
    everyPlayer: true,
  });
}

export async function resetOwnPlayerWordsNode(gameId: string, uid: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  try {
    await remove(playerWordsRootRef(roomId, uid));
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    if (__DEV__) {
      console.warn('resetOwnPlayerWordsNode', error);
    }
  }
}

export async function reconcileOwnPlayerWordsWithSession(
  gameId: string,
  uid: string,
  session: GameSession,
  words: ReadonlyMap<string, StoredPlayerWord>,
): Promise<boolean> {
  if (session.status !== 'playing' || !session.players[uid]) {
    return false;
  }
  if (words.size === 0 || (session.players[uid]?.wordCount ?? 0) > 0) {
    return false;
  }
  if (!wordsAreFromPreviousRound(session, words)) {
    return false;
  }
  await resetOwnPlayerWordsNode(gameId, uid);
  return true;
}

export async function getOwnPlayerWords(
  gameId: string,
  uid: string,
): Promise<Map<string, StoredPlayerWord>> {
  const roomId = normalizeRoomCode(gameId);
  const snapshot = await get(playerWordsRootRef(roomId, uid));
  return parsePlayerWordsSnapshot(snapshot);
}

export async function clearPlayerWords(gameId: string, uid: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  await remove(playerWordsRootRef(roomId, uid));
}

export async function restorePlayerWordsToFirebase(
  gameId: string,
  uid: string,
  words: Map<string, StoredPlayerWord>,
): Promise<void> {
  if (words.size === 0) {
    return;
  }
  await ensureAnonymousAuth();
  const roomId = normalizeRoomCode(gameId);
  const sessionSnapshot = await get(sessionRef(roomId));
  if (!sessionSnapshot.exists()) {
    return;
  }
  const session = sessionSnapshot.val() as GameSession;
  if (session.status !== 'playing' || !session.players[uid]) {
    return;
  }

  const remoteSnapshot = await get(playerWordsRootRef(roomId, uid));
  const remoteKeys = new Set<string>();
  if (remoteSnapshot.exists()) {
    for (const key of Object.keys(remoteSnapshot.val() as Record<string, unknown>)) {
      remoteKeys.add(key);
    }
  }

  await Promise.all(
    [...words.entries()].map(async ([normalized, value]) => {
      if (remoteKeys.has(normalized)) {
        return;
      }
      try {
        await set(playerWordRef(roomId, uid, normalized), {
          display: value.display,
          at: value.at,
        });
      } catch (error) {
        if (isFirebasePermissionDenied(error)) {
          if (__DEV__) {
            console.warn('restorePlayerWordsToFirebase permission_denied', {
              uid,
              normalized,
            });
          }
          return;
        }
        if (__DEV__) {
          console.warn('restorePlayerWordsToFirebase', error);
        }
      }
    }),
  );
}

function emitMergedPlayerWords(
  byPlayer: Map<string, Map<string, StoredPlayerWord>>,
  listener: (byPlayer: Map<string, Map<string, StoredPlayerWord>>) => void,
): void {
  const merged = new Map<string, Map<string, StoredPlayerWord>>();
  for (const [uid, words] of byPlayer) {
    merged.set(uid, new Map(words));
  }
  listener(merged);
}

export async function fetchSessionPlayerWords(
  gameId: string,
  playerIds: readonly string[],
): Promise<Map<string, Map<string, StoredPlayerWord>>> {
  const roomId = normalizeRoomCode(gameId);
  const byPlayer = new Map<string, Map<string, StoredPlayerWord>>();
  await Promise.all(
    playerIds.map(async (uid) => {
      try {
        const snapshot = await get(playerWordsRootRef(roomId, uid));
        byPlayer.set(uid, parsePlayerWordsSnapshot(snapshot));
      } catch (error) {
        if (__DEV__) {
          console.warn('fetchSessionPlayerWords', uid, error);
        }
        byPlayer.set(uid, new Map());
      }
    }),
  );
  return byPlayer;
}

export function subscribeSessionPlayerWords(
  gameId: string,
  playerIds: readonly string[],
  listener: (byPlayer: Map<string, Map<string, StoredPlayerWord>>) => void,
): Unsubscribe {
  const roomId = normalizeRoomCode(gameId);
  const byPlayer = new Map<string, Map<string, StoredPlayerWord>>();

  if (playerIds.length === 0) {
    listener(new Map());
    return () => {};
  }

  const unsubs = playerIds.map((uid) =>
    onValue(
      playerWordsRootRef(roomId, uid),
      (snapshot) => {
        byPlayer.set(uid, parsePlayerWordsSnapshot(snapshot));
        emitMergedPlayerWords(byPlayer, listener);
      },
      (error) => {
        if (__DEV__) {
          console.warn('subscribeSessionPlayerWords', uid, error);
        }
      },
    ),
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export function subscribePlayerWords(
  gameId: string,
  uid: string,
  listener: (words: Map<string, StoredPlayerWord>) => void,
): Unsubscribe {
  const normalized = normalizeRoomCode(gameId);
  return onValue(
    playerWordsRootRef(normalized, uid),
    (snapshot) => {
      listener(parsePlayerWordsSnapshot(snapshot));
    },
    (error) => {
      if (__DEV__) {
        console.warn('subscribePlayerWords', error);
      }
      listener(new Map());
    },
  );
}

export function storedWordsToScoredEntries(
  words: Map<string, StoredPlayerWord>,
  session: GameSession,
  uniqueBonusEnabled: boolean,
): {
  entries: ScoredWordEntry[];
  displays: string[];
} {
  const sorted = [...words.entries()].sort((a, b) => a[1].at - b[1].at);
  return {
    entries: sorted.map(([normalized]) => {
      const globalCount = globalWordCount(session.wordPlayers, normalized) || 1;
      const kind = globalCount > 1 ? 'normal' : 'unique';
      return toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
    }),
    displays: sorted.map(([, row]) => row.display),
  };
}

export type SubmitWordError = 'NOT_PLAYING' | 'DUPLICATE' | 'SESSION_MISSING' | 'PLAYER_MISSING';

export type SubmitOnlineWordOptions = {
  profile?: SubmitWordProfile | null;
};

async function commitPlayerScorePlan(
  gameId: string,
  plan: PlayerScoreUpdatePlan,
  profile: SubmitWordProfile | null,
): Promise<boolean> {
  if (plan.mode === 'single') {
    const tx = await runRtdbTransaction(sessionPlayerRef(gameId, plan.uid), (player) => {
      if (player == null || typeof player !== 'object') {
        return undefined;
      }
      return {
        ...(player as GameSession['players'][string]),
        score: plan.nextScore,
        wordCount: plan.nextWordCount,
      };
    });
    profile?.mark('sessionFastTx');
    return tx.committed;
  }

  const tx = await runRtdbTransaction(sessionPlayersRef(gameId), (players) => {
    if (players == null || typeof players !== 'object') {
      return undefined;
    }
    const next = { ...(players as GameSession['players']) };
    const firstPlayer = next[plan.firstUid];
    if (!firstPlayer || !next[plan.uid]) {
      return undefined;
    }
    next[plan.firstUid] = { ...firstPlayer, score: plan.firstNextScore };
    next[plan.uid] = {
      ...next[plan.uid],
      score: plan.nextScore,
      wordCount: plan.nextWordCount,
    };
    return next;
  });
  profile?.mark('sessionDualTx');
  return tx.committed;
}

/**
 * Persist an accepted word: sharded word maps + fast session score + player word node.
 */
export async function submitOnlineWord(
  gameId: string,
  uid: string,
  normalized: string,
  display: string,
  uniqueBonusEnabled: boolean,
  options?: SubmitOnlineWordOptions,
): Promise<{ ok: true; entry: ScoredWordEntry } | { ok: false; error: SubmitWordError }> {
  const profile = options?.profile ?? null;
  try {
    await ensureAnonymousAuth();
    profile?.mark('auth');
    const roomId = normalizeRoomCode(gameId);

    let entry: ScoredWordEntry = toScoredWordEntry(normalized, 'normal', uniqueBonusEnabled, 1);

    let playersOnWord: Record<string, boolean>;
    let prevGlobal: number;
    try {
      const committedShard = await runRtdbTransaction(
        wordPlayersShardPlayerRef(roomId, normalized, uid),
        (current) => {
          if (current === true) {
            return undefined;
          }
          return true;
        },
      );
      profile?.mark('wordPlayersShardTx');

      if (!committedShard.committed) {
        return { ok: false, error: 'DUPLICATE' };
      }

      const parentSnapshot = await get(wordPlayersPerWordRef(roomId, normalized));
      playersOnWord = (parentSnapshot.val() as Record<string, boolean> | null) ?? {};
      if (!playersOnWord[uid]) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      const globalCount = Object.keys(playersOnWord).length;
      prevGlobal = Math.max(0, globalCount - 1);
      const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
      entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }

    let firstUid: string | undefined;
    if (prevGlobal === 0) {
      try {
        const firstCommit = await runRtdbTransaction(
          wordFirstPerWordRef(roomId, normalized),
          (current) => {
            if (current != null && typeof current === 'string') {
              return undefined;
            }
            return uid;
          },
        );
        profile?.mark('wordFirstSet');
        const value = firstCommit.snapshot.val();
        firstUid = typeof value === 'string' ? value : uid;
      } catch (error) {
        if (isFirebasePermissionDenied(error)) {
          try {
            const firstSnapshot = await get(wordFirstPerWordRef(roomId, normalized));
            if (firstSnapshot.exists() && typeof firstSnapshot.val() === 'string') {
              firstUid = firstSnapshot.val() as string;
              profile?.mark('wordFirstSet');
            } else {
              await rollbackWordMapsShard(roomId, normalized, uid);
              return { ok: false, error: 'NOT_PLAYING' };
            }
          } catch {
            await rollbackWordMapsShard(roomId, normalized, uid);
            return { ok: false, error: 'NOT_PLAYING' };
          }
        } else {
          await rollbackWordMapsShard(roomId, normalized, uid);
          throw error;
        }
      }
    } else {
      try {
        const firstSnapshot = await get(wordFirstPerWordRef(roomId, normalized));
        firstUid =
          firstSnapshot.exists() && typeof firstSnapshot.val() === 'string'
            ? (firstSnapshot.val() as string)
            : undefined;
      } catch {
        firstUid = undefined;
      }
    }

    const maps: SessionWordMaps = buildPartialWordMaps(normalized, playersOnWord, firstUid);

    let sessionSnapshot;
    try {
      sessionSnapshot = await get(sessionRef(roomId));
    } catch (error) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }

    if (!sessionSnapshot.exists()) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      return { ok: false, error: 'SESSION_MISSING' };
    }

    const session = sessionSnapshot.val() as GameSession;
    const planned = planPlayerScoreUpdate(
      session,
      maps,
      uid,
      normalized,
      entry,
      uniqueBonusEnabled,
    );
    if (!planned.ok) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      return { ok: false, error: planned.error };
    }

    let sessionCommitted = false;
    try {
      sessionCommitted = await commitPlayerScorePlan(roomId, planned.plan, profile);
    } catch (error) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }

    if (!sessionCommitted) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      return { ok: false, error: 'NOT_PLAYING' };
    }

    try {
      await set(playerWordRef(roomId, uid, normalized), {
        display,
        at: Date.now(),
      });
    } catch (error) {
      await rollbackWordMapsShard(roomId, normalized, uid);
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'DUPLICATE' };
      }
      throw error;
    }
    profile?.mark('wordSet');

    profile?.mark('done');
    return { ok: true, entry };
  } catch (error) {
    if (__DEV__) {
      console.warn('submitOnlineWord', error);
    }
    return { ok: false, error: 'SESSION_MISSING' };
  }
}
