import type { GameSession } from '../firebase/types.js';

/**
 * True when RTDB still has a live round clock (running or paused).
 * Used after a failed finish-if-expired so a stale local `timerEndsAt` cannot
 * force results while peers already extended time or activated pause.
 */
export function isRemoteRoundClockStillRunning(
  session: Pick<GameSession, 'status' | 'timerEndsAt' | 'pauseState'>,
  now: number,
): boolean {
  if (session.status !== 'playing') {
    return false;
  }
  if (session.pauseState?.active === true) {
    return true;
  }
  return session.timerEndsAt != null && now < session.timerEndsAt;
}
