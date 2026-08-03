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
