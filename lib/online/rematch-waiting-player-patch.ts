import type { GameSession, GameSessionPlayer } from '../firebase/types.js';

/** True when this player explicitly opted into the next round (Play again / results exit). */
export function hasOptedIntoRematch(
  session: GameSession,
  playerId: string,
  actorUid: string,
): boolean {
  return playerId === actorUid || session.resultsExitedBy?.[playerId] === true;
}

/** Presence and score reset when a finished session reopens for rematch. */
export function rematchWaitingPlayerPatch(
  session: GameSession,
  playerId: string,
  actorUid: string,
): Pick<GameSessionPlayer, 'score' | 'wordCount' | 'online' | 'hasLeft'> {
  if (hasOptedIntoRematch(session, playerId, actorUid)) {
    return { score: 0, wordCount: 0, online: true, hasLeft: false };
  }
  return { score: 0, wordCount: 0, online: false, hasLeft: false };
}
