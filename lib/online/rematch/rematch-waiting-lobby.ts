import type { GameSession } from '../../firebase/types.js';
import { assertLobbyVisiblePlayerState } from '../invariants.js';

/** Waiting lobby for round 2+ after a finished session reopens for rematch. */
export function isRematchWaitingLobby(
  session: Pick<GameSession, 'status' | 'baseWordRound'>,
): boolean {
  return session.status === 'waiting' && (session.baseWordRound ?? 0) > 0;
}

/** Opted into rematch waiting: present in lobby (`online`) or just pressed «Грати ще». */
export function isRematchWaitingLobbyOptedIn(
  session: Pick<GameSession, 'players' | 'resultsExitedBy'>,
  uid: string,
): boolean {
  const player = session.players[uid];
  if (!player) {
    return false;
  }
  return player.online === true || session.resultsExitedBy?.[uid] === true;
}

/**
 * Whether a rostered player should appear in the waiting lobby UI.
 * First-round waiting shows everyone; rematch waiting only shows opt-in participants.
 */
export function isLobbyVisiblePlayer(session: GameSession, uid: string): boolean {
  const player = session.players[uid];
  if (!player) {
    return false;
  }
  if (player.hasLeft === true) {
    return false;
  }
  if (!isRematchWaitingLobby(session)) {
    return true;
  }
  const visible = isRematchWaitingLobbyOptedIn(session, uid);
  assertLobbyVisiblePlayerState(uid, player, visible);
  return visible;
}
