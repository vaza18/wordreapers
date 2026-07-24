import type { GameSession } from '../../firebase/types.js';

import type { AllPlayerWords } from './clone-player-words.js';

/**
 * True when every player with a non-zero wordCount has at least one word node loaded.
 */
export function isSessionWordsSnapshotReady(
  session: Pick<GameSession, 'players'>,
  words: AllPlayerWords,
): boolean {
  for (const [uid, player] of Object.entries(session.players)) {
    if ((player.wordCount ?? 0) > 0 && (words.get(uid)?.size ?? 0) === 0) {
      return false;
    }
  }
  return true;
}
