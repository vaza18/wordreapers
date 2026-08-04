import type { GameSession, SessionWordMaps } from './types.js';

export type { SessionWordMaps } from './types.js';

export type GameSessionWithId = GameSession & { id: string };

/** Count players who submitted a normalized word (`true` leaves only). */
export function globalWordCount(
  wordPlayers: SessionWordMaps['wordPlayers'] | undefined,
  normalized: string,
): number {
  const playersOnWord = wordPlayers?.[normalized] ?? {};
  let count = 0;
  for (const onWord of Object.values(playersOnWord)) {
    if (onWord === true) {
      count += 1;
    }
  }
  return count;
}

/** Remove merged word-map fields before writing core RTDB session nodes. */
export function stripWordMapsFromSession(session: GameSession): GameSession {
  const copy = { ...session };
  delete copy.wordPlayers;
  return copy;
}

/** Attach RTDB word maps to a core session snapshot for play/results call sites. */
export function mergeSessionWithWordMaps(
  core: GameSessionWithId,
  maps: SessionWordMaps | null,
): GameSessionWithId {
  if (!maps) {
    return core;
  }
  return {
    ...core,
    wordPlayers: maps.wordPlayers,
  };
}

/** Pick word maps from a merged session-shaped object (e.g. archives). */
export function sessionWordMapsFromSession(
  session: Pick<GameSession, 'wordPlayers'>,
): SessionWordMaps {
  return {
    wordPlayers: session.wordPlayers,
  };
}

export const EMPTY_SESSION_WORD_MAPS: SessionWordMaps = {
  wordPlayers: {},
};

type WordPlayersMap = NonNullable<SessionWordMaps['wordPlayers']>;

/** Parse a wordPlayers/{normalized} child value into true-only uid leaves. */
function parseTrueOnlyPlayers(rawPlayers: unknown): Record<string, true> | null {
  if (rawPlayers == null || typeof rawPlayers !== 'object') {
    return null;
  }
  const parsed: Record<string, true> = {};
  for (const [uid, onWord] of Object.entries(rawPlayers as Record<string, unknown>)) {
    if (onWord === true) {
      parsed[uid] = true;
    }
  }
  // Empty object / only false leaves → treat as remove (no ghost word keys).
  if (Object.keys(parsed).length === 0) {
    return null;
  }
  return parsed;
}

/**
 * Apply onChildAdded / onChildChanged for one normalized word under wordPlayers.
 * Non-object / null raw clears the key (same as removed).
 */
export function applyWordPlayersChildSnapshot(
  wordPlayers: WordPlayersMap,
  normalized: string,
  rawPlayers: unknown,
): WordPlayersMap {
  const parsed = parseTrueOnlyPlayers(rawPlayers);
  if (parsed == null) {
    return removeWordPlayersChild(wordPlayers, normalized);
  }
  return {
    ...wordPlayers,
    [normalized]: parsed,
  };
}

/** Apply onChildRemoved for one normalized word under wordPlayers. */
export function removeWordPlayersChild(
  wordPlayers: WordPlayersMap,
  normalized: string,
): WordPlayersMap {
  if (!(normalized in wordPlayers)) {
    return wordPlayers;
  }
  const next = { ...wordPlayers };
  delete next[normalized];
  return next;
}
