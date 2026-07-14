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
      mode: 'peers';
      uid: string;
      nextScore: number;
      nextWordCount: number;
      peerScores: { uid: string; nextScore: number }[];
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
    maps: buildPartialWordMaps(normalized, playersOnWord),
  };
}

/** Build partial maps for one normalized word (enough for score planning). */
export function buildPartialWordMaps(
  normalized: string,
  playersOnWord: Record<string, boolean>,
): SessionWordMaps {
  return {
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

  const wordPlayers = { ...(maps.wordPlayers ?? {}) };
  const prevGlobal = globalWordCount(wordPlayers, normalized);
  const globalCount = prevGlobal + 1;

  const playersOnWord = { ...(wordPlayers[normalized] ?? {}) };
  playersOnWord[uid] = true;
  wordPlayers[normalized] = playersOnWord;

  const kind: WordScoreKind = globalCount > 1 ? 'normal' : 'unique';
  const entry = toScoredWordEntry(normalized, kind, uniqueBonusEnabled, globalCount);

  return {
    ok: true,
    prevGlobal,
    maps: { wordPlayers },
    entry,
  };
}

/**
 * Choose single-player vs peer demotion write after maps commit.
 * Uses deltas from current session player rows (partial maps are per-word only).
 */
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

  const globalCount = globalWordCount(maps.wordPlayers, normalized);
  const prevGlobal = Math.max(0, globalCount - 1);
  const nextScore = (player.score ?? 0) + entry.points;
  const nextWordCount = (player.wordCount ?? 0) + 1;

  if (uniqueBonusEnabled && prevGlobal === 1) {
    const peerScores = Object.keys(maps.wordPlayers?.[normalized] ?? {})
      .filter((peerUid) => peerUid !== uid && session.players[peerUid])
      .map((peerUid) => ({
        uid: peerUid,
        nextScore: Math.max(0, (session.players[peerUid]?.score ?? 0) - 1),
      }));
    if (peerScores.length > 0) {
      return {
        ok: true,
        plan: {
          mode: 'peers',
          uid,
          nextScore,
          nextWordCount,
          peerScores,
        },
      };
    }
  }

  return {
    ok: true,
    plan: {
      mode: 'single',
      uid,
      nextScore,
      nextWordCount,
    },
  };
}

/** Apply a score plan to a cloned players map (for tests and full-session tx). */
export function applyPlayerScorePlan(
  players: Record<string, GameSessionPlayer>,
  plan: PlayerScoreUpdatePlan,
): Record<string, GameSessionPlayer> {
  const next = Object.fromEntries(
    Object.entries(players).map(([playerId, row]) => [playerId, { ...row }]),
  );
  if (plan.mode === 'peers') {
    for (const peer of plan.peerScores) {
      const peerPlayer = next[peer.uid];
      if (peerPlayer) {
        next[peer.uid] = { ...peerPlayer, score: peer.nextScore };
      }
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
