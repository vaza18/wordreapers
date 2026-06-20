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

import { toScoredWordEntry, type ScoredWordEntry } from '../game/scoring.js';

import {
  applyPlayerScoreFromWordSubmit,
  applyWordSubmitToWordMaps,
} from '../online/apply-word-submit-to-session.js';
import type { SubmitWordProfile } from '../online/submit-word-profile.js';
import { wordsAreFromPreviousRound } from '../online/stale-player-words.js';

import { ensureAnonymousAuth } from './auth.js';
import { isFirebasePermissionDenied } from './rtdb-errors.js';
import { getFirebaseDatabase } from './init.js';
import { gameSessionPath, playerWordsPath } from './paths.js';
import { normalizeRoomCode } from './room-code.js';
import { globalWordCount } from './session-word-maps.js';
import { sessionWordMapsRef } from './session-word-maps-service.js';
import type { GameSession } from './types.js';

export {
  roundStartMsFromSession,
  wordsAreFromPreviousRound,
} from '../online/stale-player-words.js';

export interface StoredPlayerWord {
  display: string;
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

function sessionRef(gameId: string): DatabaseReference {
  return ref(getFirebaseDatabase(), gameSessionPath(gameId));
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
    record[key] = { display: value.display, at: value.at };
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

/**
 * Persist an accepted word: word maps tx + session players tx + player word node.
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
    let committedMaps;

    try {
      committedMaps = await runTransaction(sessionWordMapsRef(roomId), (current) => {
        const maps = (current ?? {}) as {
          wordFirst?: GameSession['wordFirst'];
          wordPlayers?: GameSession['wordPlayers'];
        };
        const applied = applyWordSubmitToWordMaps(
          { wordFirst: maps.wordFirst, wordPlayers: maps.wordPlayers },
          uid,
          normalized,
          uniqueBonusEnabled,
        );
        if (!applied.ok) {
          return undefined;
        }
        entry = applied.entry;
        return applied.maps;
      });
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }
    profile?.mark('wordMapsTx');

    if (!committedMaps.committed) {
      return { ok: false, error: 'DUPLICATE' };
    }

    const maps = committedMaps.snapshot.val() as {
      wordFirst?: GameSession['wordFirst'];
      wordPlayers?: GameSession['wordPlayers'];
    };

    let sessionTx;
    try {
      sessionTx = await runTransaction(sessionRef(roomId), (current) => {
        if (current == null) {
          return undefined;
        }
        const applied = applyPlayerScoreFromWordSubmit(
          current as GameSession,
          maps,
          uid,
          normalized,
          entry,
          uniqueBonusEnabled,
        );
        if (!applied.ok) {
          return undefined;
        }
        entry = applied.entry;
        return applied.session;
      });
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }
    profile?.mark('sessionTx');

    if (!sessionTx.committed) {
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
          at: Date.now(),
        };
      });
    } catch (error) {
      if (isFirebasePermissionDenied(error)) {
        return { ok: false, error: 'NOT_PLAYING' };
      }
      throw error;
    }
    profile?.mark('wordTx');

    if (!wordTx.committed) {
      return { ok: false, error: 'DUPLICATE' };
    }

    profile?.mark('done');
    return { ok: true, entry };
  } catch (error) {
    if (__DEV__) {
      console.warn('submitOnlineWord', error);
    }
    return { ok: false, error: 'SESSION_MISSING' };
  }
}
