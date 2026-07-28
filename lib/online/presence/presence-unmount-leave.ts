import type { GameSession } from '../../firebase/types.js';

/**
 * Whether presence-hook unmount should call `leaveGameSession` (hasLeft) for a
 * waiting-room member. Initial lobby (round 0) non-organizers who leave the screen
 * without a handoff are treated as leaving the room. Rematch waiting must only go
 * offline — play disables presence on round end while a peer may already have rematched.
 */
export function shouldLeaveWaitingLobbyOnPresenceUnmount(
  session: Pick<GameSession, 'status' | 'organizerId'> &
    Partial<Pick<GameSession, 'baseWordRound' | 'resultsExitedBy'>>,
  uid: string,
): boolean {
  if (session.status !== 'waiting') {
    return false;
  }
  if (session.organizerId === uid) {
    return false;
  }
  // Rematch waiting: presence unmount ≠ intentional lobby exit.
  if ((session.baseWordRound ?? 0) > 0) {
    return false;
  }
  // Durable rematch latch (defensive): never hasLeft via presence cleanup.
  if (session.resultsExitedBy?.[uid] === true) {
    return false;
  }
  return true;
}
