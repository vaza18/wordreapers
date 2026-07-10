import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import { globalWordCount } from '@/lib/firebase/session-word-maps';
import type { GameSession, GameSessionPlayer, SessionWordMaps } from '@/lib/firebase/types';

/** Authoritative per-player totals from committed word maps (after shard write). */
export function playerTotalsFromMaps(
  maps: SessionWordMaps,
  uid: string,
  uniqueBonusEnabled: boolean,
): { score: number; wordCount: number } {
  let score = 0;
  let wordCount = 0;
  const wordPlayers = maps.wordPlayers ?? {};
  for (const [normalized, playersOnWord] of Object.entries(wordPlayers)) {
    if (!playersOnWord[uid]) {
      continue;
    }
    const globalCount = globalWordCount(wordPlayers, normalized);
    const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
    score += toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount).points;
    wordCount += 1;
  }
  return { score, wordCount };
}

export type ApplyWordSubmitError = 'NOT_PLAYING' | 'DUPLICATE';

export type ApplyWordMapsResult =
  | { ok: true; maps: SessionWordMaps; entry: ScoredWordEntry; prevGlobal: number }
  | { ok: false; error: ApplyWordSubmitError };

export type ApplyPlayerScoreResult =
  | { ok: true; session: GameSession; entry: ScoredWordEntry }
  | { ok: false; error: ApplyWordSubmitError };

export type PlayerScoreUpdatePlan =
  | {
      mode: 'single';
      uid: string;
      nextScore: number;
      nextWordCount: number;
    }
  | {
      mode: 'dual';
      firstUid: string;
      firstNextScore: number;
      uid: string;
      nextScore: number;
      nextWordCount: number;
    };

export type PlanPlayerScoreUpdateResult =
  { ok: true; plan: PlayerScoreUpdatePlan } | { ok: false; error: ApplyWordSubmitError };

/**
 * Transaction body for `session_word_maps/{gameId}/wordPlayers/{normalized}`.
 */
export function applyWordSubmitToWordPlayersShard(
  current: Record<string, boolean> | null,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
): ApplyWordMapsResult {
  const playersOnWord = { ...(current ?? {}) };
  if (playersOnWord[uid]) {
    return { ok: false, error: 'DUPLICATE' };
  }

  const prevGlobal = Object.keys(playersOnWord).length;
  const globalCount = prevGlobal + 1;
  playersOnWord[uid] = true;

  const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
  const entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);

  return {
    ok: true,
    prevGlobal,
    entry,
    maps: buildPartialWordMaps(normalized, playersOnWord, prevGlobal === 0 ? uid : undefined),
  };
}

/** Build partial maps for one normalized word (enough for score planning). */
export function buildPartialWordMaps(
  normalized: string,
  playersOnWord: Record<string, boolean>,
  firstUid?: string,
): SessionWordMaps {
  return {
    wordFirst: firstUid ? { [normalized]: firstUid } : {},
    wordPlayers: { [normalized]: playersOnWord },
  };
}

/**
 * Update shared word maps (RTDB `session_word_maps/{gameId}` transaction body).
 * Used by tests simulating full-tree map updates.
 */
export function applyWordSubmitToWordMaps(
  maps: SessionWordMaps,
  uid: string,
  normalized: string,
  uniqueBonusEnabled: boolean,
): ApplyWordMapsResult | { ok: false; error: ApplyWordSubmitError } {
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
    prevGlobal,
    maps: { wordFirst, wordPlayers },
    entry,
  };
}

/** Choose single-player vs dual-player session write after maps commit. */
export function planPlayerScoreUpdate(
  session: GameSession,
  maps: SessionWordMaps,
  uid: string,
  normalized: string,
  entry: ScoredWordEntry,
  uniqueBonusEnabled: boolean,
): PlanPlayerScoreUpdateResult {
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

  const submitterTotals = playerTotalsFromMaps(maps, uid, uniqueBonusEnabled);
  const globalCount = globalWordCount(maps.wordPlayers, normalized);
  if (globalCount > 1 && uniqueBonusEnabled) {
    const firstUid = maps.wordFirst?.[normalized];
    if (firstUid && firstUid !== uid && session.players[firstUid]) {
      const firstTotals = playerTotalsFromMaps(maps, firstUid, uniqueBonusEnabled);
      return {
        ok: true,
        plan: {
          mode: 'dual',
          firstUid,
          firstNextScore: firstTotals.score,
          uid,
          nextScore: submitterTotals.score,
          nextWordCount: submitterTotals.wordCount,
        },
      };
    }
  }

  return {
    ok: true,
    plan: {
      mode: 'single',
      uid,
      nextScore: submitterTotals.score,
      nextWordCount: submitterTotals.wordCount,
    },
  };
}

/** Apply a score plan to a cloned players map (for tests and legacy full-session tx). */
export function applyPlayerScorePlan(
  players: Record<string, GameSessionPlayer>,
  plan: PlayerScoreUpdatePlan,
): Record<string, GameSessionPlayer> {
  const next = Object.fromEntries(
    Object.entries(players).map(([playerId, row]) => [playerId, { ...row }]),
  );
  if (plan.mode === 'dual') {
    const firstPlayer = next[plan.firstUid];
    if (firstPlayer) {
      next[plan.firstUid] = { ...firstPlayer, score: plan.firstNextScore };
    }
  }
  const submitter = next[plan.uid];
  if (!submitter) {
    return next;
  }
  next[plan.uid] = {
    ...submitter,
    score: plan.nextScore,
    wordCount: plan.nextWordCount,
  };
  return next;
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
  const planned = planPlayerScoreUpdate(session, maps, uid, normalized, entry, uniqueBonusEnabled);
  if (!planned.ok) {
    return planned;
  }

  return {
    ok: true,
    entry,
    session: {
      ...session,
      players: applyPlayerScorePlan(session.players, planned.plan),
    },
  };
}
