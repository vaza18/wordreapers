import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import { globalWordCount } from '@/lib/firebase/session-word-maps';
import type { GameSession, SessionWordMaps } from '@/lib/firebase/types';

export type ApplyWordSubmitError = 'NOT_PLAYING' | 'DUPLICATE';

export type ApplyWordMapsResult =
  | { ok: true; maps: SessionWordMaps; entry: ScoredWordEntry }
  | { ok: false; error: ApplyWordSubmitError };

export type ApplyPlayerScoreResult =
  | { ok: true; session: GameSession; entry: ScoredWordEntry }
  | { ok: false; error: ApplyWordSubmitError };

/**
 * Update shared word maps (RTDB `session_word_maps/{gameId}` transaction body).
 */
export function applyWordSubmitToWordMaps(
  maps: SessionWordMaps,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
): ApplyWordMapsResult {
  if (maps.wordPlayers?.[normalized]?.[uid]) {
    return { ok: false, error: 'DUPLICATE' };
  }

  const wordFirst = { ...(maps.wordFirst ?? {}) };
  const wordPlayers = { ...(maps.wordPlayers ?? {}) };
  const prevGlobal = globalWordCount(wordPlayers, normalized);
  const globalCount = prevGlobal + 1;

  const playersOnWord = { ...(wordPlayers[normalized] ?? {}) };
  playersOnWord[uid] = true;
  wordPlayers[normalized] = playersOnWord;

  if (prevGlobal === 0) {
    wordFirst[normalized] = uid;
  }

  const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
  const entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);

  return {
    ok: true,
    maps: { wordFirst, wordPlayers },
    entry,
  };
}

/**
 * Apply score deltas to session players after word maps commit.
 */
export function applyPlayerScoreFromWordSubmit(
  session: GameSession,
  maps: SessionWordMaps,
  uid: string,
  normalized: string,
  entry: ScoredWordEntry,
  uniqueBonusEnabled: boolean,
): ApplyPlayerScoreResult {
  if (session.status !== 'playing') {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  const player = session.players[uid];
  if (!player) {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  if (maps.wordPlayers?.[normalized]?.[uid] !== true) {
    return { ok: false, error: 'NOT_PLAYING' };
  }

  const players = Object.fromEntries(
    Object.entries(session.players).map(([playerId, row]) => [playerId, { ...row }]),
  );

  const globalCount = globalWordCount(maps.wordPlayers, normalized);
  if (globalCount > 1 && uniqueBonusEnabled) {
    const firstUid = maps.wordFirst?.[normalized];
    if (firstUid && firstUid !== uid) {
      const firstPlayer = players[firstUid];
      if (firstPlayer) {
        firstPlayer.score = Math.max(0, (firstPlayer.score ?? 0) - 1);
      }
    }
  }

  const nextPlayer = players[uid];
  if (!nextPlayer) {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  nextPlayer.score = (nextPlayer.score ?? 0) + entry.points;
  nextPlayer.wordCount = (nextPlayer.wordCount ?? 0) + 1;
  nextPlayer.online = true;
  players[uid] = nextPlayer;

  return {
    ok: true,
    session: { ...session, players },
    entry,
  };
}

/** @deprecated Use applyWordSubmitToWordMaps + applyPlayerScoreFromWordSubmit. */
export function applyWordSubmitToSession(
  session: GameSession,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
): ApplyPlayerScoreResult {
  if (session.status !== 'playing') {
    return { ok: false, error: 'NOT_PLAYING' };
  }
  const player = session.players[uid];
  if (!player) {
    return { ok: false, error: 'NOT_PLAYING' };
  }

  const maps: SessionWordMaps = {
    wordFirst: session.wordFirst,
    wordPlayers: session.wordPlayers,
  };
  const mapsResult = applyWordSubmitToWordMaps(maps, uid, normalized, uniqueBonusEnabled);
  if (!mapsResult.ok) {
    return mapsResult;
  }

  const mergedMaps = mapsResult.maps;
  const scoreResult = applyPlayerScoreFromWordSubmit(
    session,
    mergedMaps,
    uid,
    normalized,
    mapsResult.entry,
    uniqueBonusEnabled,
  );
  if (!scoreResult.ok) {
    return scoreResult;
  }

  return {
    ok: true,
    session: {
      ...scoreResult.session,
      wordFirst: mergedMaps.wordFirst,
      wordPlayers: mergedMaps.wordPlayers,
    },
    entry: mapsResult.entry,
  };
}
