import { toScoredWordEntry, type ScoredWordEntry, type WordScoreKind } from '@/lib/game/scoring';
import { globalWordCount } from '@/lib/firebase/session-word-maps';
import type { SessionWordMaps } from '@/lib/firebase/types';

export type ApplyWordSubmitError = 'NOT_PLAYING' | 'DUPLICATE';

export type ApplyWordMapsResult =
  | { ok: true; maps: SessionWordMaps; entry: ScoredWordEntry; prevGlobal: number }
  | { ok: false; error: ApplyWordSubmitError };

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

  const prevGlobal = Object.values(playersOnWord).filter((onWord) => onWord === true).length;
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
