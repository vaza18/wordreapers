import type { GameSession, GameSessionPlayer } from '../../firebase/types.js';

import { liveParticipantOpponentIds } from './live-round-membership.js';

/**
 * Player is in the round and either connected (`online`) or has session counters
 * proving recent activity when the presence flag lags behind RTDB writes.
 */
export function isPlayerConnectedInSession(player: GameSessionPlayer | undefined): boolean {
  if (!player) {
    return false;
  }
  if (player.online === true) {
    return true;
  }
  if (player.hasLeft === true) {
    return false;
  }
  return (player.wordCount ?? 0) > 0 || (player.score ?? 0) > 0;
}

/**
 * At least one other live-round participant remains (for solo vs vote UI).
 */
export function hasActiveOpponent(session: GameSession, myUid: string): boolean {
  return liveParticipantOpponentIds(session, myUid).length > 0;
}

/**
 * At least one other live-round participant is connected or has scored this round.
 */
export function hasOnlineOpponent(session: GameSession, myUid: string): boolean {
  return onlineActiveOpponentIds(session, myUid).length > 0;
}

/** Other live-round participants currently connected or actively scoring. */
export function onlineActiveOpponentIds(session: GameSession, myUid: string): string[] {
  return liveParticipantOpponentIds(session, myUid).filter((id) =>
    isPlayerConnectedInSession(session.players[id]),
  );
}

export function onlineActiveOpponentNames(session: GameSession, myUid: string): string[] {
  return onlineActiveOpponentIds(session, myUid).map((id) => session.players[id]?.name ?? id);
}
