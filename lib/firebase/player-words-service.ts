import {
  get,
  onValue,
  ref,
  remove,
  runTransaction,
  update,
  type DatabaseReference,
  type Unsubscribe,
} from 'firebase/database';

import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '../game/scoring.js';

import { ensureAnonymousAuth } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { getFirebaseDatabase } from './init.js';
import { gameSessionPath, playerWordsPath } from './paths.js';
import { normalizeRoomCode } from './room-code.js';
import type { GameSession } from './types.js';

import { wordsAreFromPreviousRound } from '../online/stale-player-words.js';

export {
  roundStartMsFromSession,
  wordsAreFromPreviousRound,
} from '../online/stale-player-words.js';

export interface StoredPlayerWord {
  display: string;
  kind: WordScoreKind;
  points: number;
  badge: string | null;
  at: number;
}

function playerWordRef(gameId: string, uid: string, normalized: string): DatabaseReference {
  return ref(getFirebaseDatabase(), `${playerWordsPath(gameId, uid)}/${normalized}`);
}

function playerWordsRootRef(gameId: string, uid: string): DatabaseReference {
  return ref(getFirebaseDatabase(), playerWordsPath(gameId, uid));
}

function roomPlayerWordsRef(gameId: string): DatabaseReference {
  const roomId = normalizeRoomCode(gameId);
  return ref(getFirebaseDatabase(), `player_words/${roomId}`);
}

/**
 * Remove all per-player word nodes (rematch or new round).
 * Deletes each `player_words/{gameId}/{uid}` child — not the room parent (rules deny parent writes).
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

/**
 * Organizer clears stale `player_words` when entering a waiting lobby (rematch / rejoin).
 * Works with default RTDB rules (organizer-only delete during `waiting`).
 */
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
    // remove(), not set({}): replacing a populated node with {} is evaluated as
    // per-child deletes, which rules deny during `playing`.
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

/**
 * Drop stale RTDB words when session scores were reset but `player_words` was not cleared.
 */
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

/**
 * Remove one player's words (left mid-round / app background — progress parked locally).
 */
export async function clearPlayerWords(gameId: string, uid: string): Promise<void> {
  const roomId = normalizeRoomCode(gameId);
  await remove(playerWordsRootRef(roomId, uid));
}

/**
 * Re-upload parked words after the player returns before timer ends.
 */
export async function restorePlayerWordsToFirebase(
  gameId: string,
  uid: string,
  words: Map<string, StoredPlayerWord>,
): Promise<void> {
  if (words.size === 0) {
    return;
  }
  const roomId = normalizeRoomCode(gameId);
  const sessionSnapshot = await get(sessionRef(roomId));
  if (!sessionSnapshot.exists()) {
    return;
  }
  const session = sessionSnapshot.val() as GameSession;
  if (session.status !== 'playing' || !session.players[uid]) {
    return;
  }

  const record: Record<string, StoredPlayerWord> = {};
  for (const [key, value] of words) {
    record[key] = value;
  }
  try {
    await update(playerWordsRootRef(roomId, uid), record);
  } catch (error) {
    if (isFirebasePermissionDenied(error)) {
      return;
    }
    if (__DEV__) {
      console.warn('restorePlayerWordsToFirebase', error);
    }
  }
}

function sessionRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPath(gameId));
}

function parsePlayerWordsSnapshot(snapshot: {
  exists: () => boolean;
  val: () => unknown;
}): Map<string, StoredPlayerWord> {
  const map = new Map<string, StoredPlayerWord>();
  if (!snapshot.exists()) {
    return map;
  }
  const raw = snapshot.val() as Record<string, StoredPlayerWord>;
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value.display === 'string') {
      map.set(key, value);
    }
  }
  return map;
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

/**
 * One-shot fetch of every roster player's words (results screen bootstrap).
 */
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

/**
 * Live merge of each player's `player_words/{gameId}/{uid}` node (reliable vs parent listen).
 */
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

/**
 * Live list of accepted words for the current player.
 */
export function subscribePlayerWords(
  gameId: string,
  uid: string,
  listener: (words: Map<string, StoredPlayerWord>) => void,
): Unsubscribe {
  const normalized = normalizeRoomCode(gameId);
  return onValue(
    playerWordsRootRef(normalized, uid),
    (snapshot) => {
      const map = new Map<string, StoredPlayerWord>();
      if (!snapshot.exists()) {
        listener(map);
        return;
      }
      const raw = snapshot.val() as Record<string, StoredPlayerWord>;
      for (const [key, value] of Object.entries(raw)) {
        if (value && typeof value.display === 'string') {
          map.set(key, value);
        }
      }
      listener(map);
    },
    (error) => {
      if (__DEV__) {
        console.warn('subscribePlayerWords', error);
      }
      listener(new Map());
    },
  );
}

/**
 * Convert stored words to scored entries for the word list UI.
 */
export function storedWordsToScoredEntries(words: Map<string, StoredPlayerWord>): {
  entries: ScoredWordEntry[];
  displays: string[];
} {
  const sorted = [...words.entries()].sort((a, b) => a[1].at - b[1].at);
  return {
    entries: sorted.map(([normalized, row]) => ({
      normalized,
      kind: row.kind,
      points: row.points,
      badge: row.badge as ScoredWordEntry['badge'],
    })),
    displays: sorted.map(([, row]) => row.display),
  };
}

export type SubmitWordError = 'NOT_PLAYING' | 'DUPLICATE' | 'SESSION_MISSING' | 'PLAYER_MISSING';

/**
 * Persist an accepted word: claim (transaction) + player stats + private word node.
 */
export async function submitOnlineWord(
  gameId: string,
  uid: string,
  normalized: string,
  display: string,
  uniqueBonusEnabled: boolean,
): Promise<{ ok: true; entry: ScoredWordEntry } | { ok: false; error: SubmitWordError }> {
  try {
    await ensureAnonymousAuth();
    const roomId = normalizeRoomCode(gameId);
    const sessionSnapshot = await get(sessionRef(roomId));
    if (!sessionSnapshot.exists()) {
      return { ok: false, error: 'SESSION_MISSING' };
    }
    const preSession = sessionSnapshot.val() as GameSession;
    if (preSession.status !== 'playing' || !preSession.players[uid]) {
      return { ok: false, error: 'NOT_PLAYING' };
    }

    let wordTx;
    try {
      wordTx = await runTransaction(playerWordRef(roomId, uid, normalized), (current) => {
        if (current != null) {
          return undefined;
        }
        return {
          display,
          kind: 'normal' as WordScoreKind,
          points: 1,
          badge: null,
          at: Date.now(),
        };
      });
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }

    if (!wordTx.committed) {
      return { ok: false, error: 'DUPLICATE' };
    }

    let entry: ScoredWordEntry = toScoredWordEntry(normalized, 'normal', uniqueBonusEnabled, 1);

    let sessionTx;
    try {
      sessionTx = await runTransaction(sessionRef(roomId), (current) => {
        if (current == null) {
          return undefined;
        }
        const session = current as GameSession;
        if (session.status !== 'playing') {
          return undefined;
        }
        const player = session.players[uid];
        if (!player) {
          return undefined;
        }

        const wordCounts = { ...(session.wordCounts ?? {}) };
        const wordFirst = { ...(session.wordFirst ?? {}) };
        const wordPlayers = { ...(session.wordPlayers ?? {}) };
        const prevGlobal = wordCounts[normalized] ?? 0;
        wordCounts[normalized] = prevGlobal + 1;
        const globalCount = prevGlobal + 1;

        const playersOnWord = { ...(wordPlayers[normalized] ?? {}) };
        playersOnWord[uid] = true;
        wordPlayers[normalized] = playersOnWord;

        const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';

        if (prevGlobal === 0) {
          wordFirst[normalized] = uid;
        } else if (uniqueBonusEnabled) {
          const firstUid = wordFirst[normalized];
          if (firstUid && firstUid !== uid) {
            const firstPlayer = session.players[firstUid];
            if (firstPlayer) {
              firstPlayer.score = Math.max(0, (firstPlayer.score ?? 0) - 1);
            }
          }
        }

        session.wordCounts = wordCounts;
        session.wordFirst = wordFirst;
        session.wordPlayers = wordPlayers;

        entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);
        const points = entry.points;
        player.score = (player.score ?? 0) + points;
        player.wordCount = (player.wordCount ?? 0) + 1;
        player.online = true;

        session.players = { ...session.players, [uid]: player };
        return session;
      });
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }

    if (!sessionTx.committed) {
      return { ok: false, error: 'NOT_PLAYING' };
    }

    try {
      await runTransaction(playerWordRef(roomId, uid, normalized), (current) => {
        if (current == null) {
          return undefined;
        }
        return {
          display,
          kind: entry.kind,
          points: entry.points,
          badge: entry.badge,
          at: Date.now(),
        };
      });
    } catch (error) {
      if (!isFirebasePermissionDenied(error) && __DEV__) {
        console.warn('submitOnlineWord kind patch', error);
      }
    }

    return { ok: true, entry };
  } catch (error) {
    if (__DEV__) {
      console.warn('submitOnlineWord', error);
    }
    return { ok: false, error: 'SESSION_MISSING' };
  }
}
