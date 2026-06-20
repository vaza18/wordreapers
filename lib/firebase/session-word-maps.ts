import type { GameSession, SessionWordMaps } from './types.js';

export type { SessionWordMaps } from './types.js';

export type GameSessionWithId = GameSession & { id: string };

/** Count players who submitted a normalized word. */
export function globalWordCount(
  wordPlayers: SessionWordMaps['wordPlayers'] | undefined,
  normalized: string,
): number {
  return Object.keys(wordPlayers?.[normalized] ?? {}).length;
}

/** Remove merged word-map fields before writing core RTDB session nodes. */
export function stripWordMapsFromSession(session: GameSession): GameSession {
  const copy = { ...session };
  delete copy.wordFirst;
  delete copy.wordPlayers;
  return copy;
}

/** Attach RTDB word maps to a core session snapshot for legacy call sites. */
export function mergeSessionWithWordMaps(
  core: GameSessionWithId,
  maps: SessionWordMaps | null,
): GameSessionWithId {
  if (!maps) {
    return core;
  }
  return {
    ...core,
    wordFirst: maps.wordFirst,
    wordPlayers: maps.wordPlayers,
  };
}

/** Pick word maps from a merged session-shaped object (e.g. archives). */
export function sessionWordMapsFromSession(
  session: Pick<GameSession, 'wordFirst' | 'wordPlayers'>,
): SessionWordMaps {
  return {
    wordFirst: session.wordFirst,
    wordPlayers: session.wordPlayers,
  };
}

export const EMPTY_SESSION_WORD_MAPS: SessionWordMaps = {
  wordFirst: {},
  wordPlayers: {},
};
