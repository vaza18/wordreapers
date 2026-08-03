import type { GameSession, SessionWordMaps } from '../../firebase/types.js';
import { mergeOwnWordsIntoWordPlayers } from '../word-players-invert.js';

/**
 * Enrich a playing session for active-round cache / exit-home so own words
 * are not lost when RTDB `wordPlayers` on the session object is still empty.
 */
export function sessionWithWordPlayersForExit(
  session: GameSession,
  options: {
    wordPlayers?: SessionWordMaps['wordPlayers'] | null;
    ownUid: string;
    ownWords: ReadonlySet<string> | readonly string[];
  },
): GameSession {
  const basePlayers = options.wordPlayers ?? session.wordPlayers;
  return {
    ...session,
    wordPlayers: mergeOwnWordsIntoWordPlayers(basePlayers, options.ownUid, options.ownWords),
  };
}
