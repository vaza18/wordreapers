import type { GameSession } from '../../firebase/types.js';
import type { AllPlayerWords } from './clone-player-words.js';
import { totalPlayerWordCount } from './live-words-snapshot.js';

/** True when archived / candidate word lists contain at least one word. */
export function archiveHasPlayerWords(
  playerWords: Record<string, string[]> | AllPlayerWords | null | undefined,
): boolean {
  if (playerWords == null) {
    return false;
  }
  if (playerWords instanceof Map) {
    return totalPlayerWordCount(playerWords) > 0;
  }
  for (const words of Object.values(playerWords)) {
    if (Array.isArray(words) && words.length > 0) {
      return true;
    }
  }
  return false;
}

/** True when client-merged session still has wordPlayers shards (maps claim words). */
export function sessionWordPlayersClaimWords(
  session: Pick<GameSession, 'wordPlayers'> | null | undefined,
): boolean {
  return Object.keys(session?.wordPlayers ?? {}).length > 0;
}

/**
 * Soft-skip archive persist when inverted maps are empty but words are still
 * claimed by live maps and/or an existing non-empty archive (rematch wipe / race).
 * Do not use RTDB `players.*.wordCount` (always 0 after derive-score pivot).
 *
 * A successful empty maps fetch with **no** claims is a valid zero-word round —
 * callers should persist that empty archive (not soft-skip forever).
 */
export function shouldSkipEmptyArchiveWords(
  session: Pick<GameSession, 'wordPlayers'> | null | undefined,
  words: AllPlayerWords,
  existing?: { playerWords?: Record<string, string[]> } | null,
): boolean {
  if (totalPlayerWordCount(words) > 0) {
    return false;
  }
  return sessionWordPlayersClaimWords(session) || archiveHasPlayerWords(existing?.playerWords);
}
