import type { GameSession, GameSessionPlayer } from '../firebase/types.js';
import { votingPlayerIds } from './voting-player-ids.js';

/**
 * Player is in the round and either connected (`online`) or has session counters
 * proving recent activity when the presence flag lags behind RTDB writes.
 */
export function isPlayerConnectedInSession(player: GameSessionPlayer | undefined): boolean {
  if (!player || player.hasLeft === true) {
    return false;
  }
  if (player.online === true) {
    return true;
  }
  return (player.wordCount ?? 0) > 0 || (player.score ?? 0) > 0;
}

/**
 * At least one other rostered player is still in the round (has not left).
 * Used for vote-to-end vs organizer-only early finish when playing alone.
 */
export function hasActiveOpponent(session: GameSession, myUid: string): boolean {
  return votingPlayerIds(session).some((id) => id !== myUid);
}

/**
 * At least one other active player is connected or has proven activity this round.
 */
export function hasOnlineOpponent(session: GameSession, myUid: string): boolean {
  return onlineActiveOpponentIds(session, myUid).length > 0;
}

/** Other rostered players currently connected or actively scoring. */
export function onlineActiveOpponentIds(session: GameSession, myUid: string): string[] {
  return votingPlayerIds(session).filter(
    (id) => id !== myUid && isPlayerConnectedInSession(session.players[id]),
  );
}

export function onlineActiveOpponentNames(session: GameSession, myUid: string): string[] {
  return onlineActiveOpponentIds(session, myUid).map((id) => session.players[id]?.name ?? id);
}
