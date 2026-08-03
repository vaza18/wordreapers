import type { AllPlayerWords } from './clone-player-words.js';
import { totalPlayerWordCount } from './live-words-snapshot.js';

/**
 * Build per-player normalized word lists from a finished archive's `playerWords`.
 * Supports v4 `string[]` and legacy `{ [normalized]: { display, at } }` leaves —
 * for stats/finalize only (UI may still hide legacy lists).
 */
export function wordsByPlayerFromArchivedPlayerWords(
  playerWords: Record<string, unknown> | null | undefined,
): AllPlayerWords {
  const out = new Map<string, string[]>();
  for (const [uid, words] of Object.entries(playerWords ?? {})) {
    if (Array.isArray(words)) {
      const list = words.filter(
        (word): word is string => typeof word === 'string' && word.length > 0,
      );
      if (list.length > 0) {
        out.set(uid, list);
      }
      continue;
    }
    if (words != null && typeof words === 'object') {
      const keys = Object.keys(words as Record<string, unknown>).filter((key) => key.length > 0);
      if (keys.length > 0) {
        out.set(uid, keys);
      }
    }
  }
  return out;
}

/**
 * Whether sync may call finalize with standings built from archive words.
 * Legacy archives with empty extract but non-zero stored counts must not
 * finalize zeros (would mark the round processed forever).
 */
export function shouldFinalizeStatsFromFinishedArchive(options: {
  isLegacy: boolean;
  wordsByPlayer: AllPlayerWords;
  playerWordCounts?: Record<string, number> | null;
}): boolean {
  if (totalPlayerWordCount(options.wordsByPlayer) > 0) {
    return true;
  }
  if (!options.isLegacy) {
    return true;
  }
  const claimed = Object.values(options.playerWordCounts ?? {}).some(
    (count) => typeof count === 'number' && count > 0,
  );
  return !claimed;
}
