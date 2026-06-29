import type { GameSession } from '../firebase/types.js';

/**
 * Load a frozen finished round from local archive when live RTDB no longer reflects
 * the round the player is still reviewing (rematch lobby or next round already playing).
 */
export function shouldRecoverFinishedRoundFromArchive(
  liveSession: GameSession | null | undefined,
): boolean {
  if (!liveSession) {
    return true;
  }
  return liveSession.status === 'waiting' || liveSession.status === 'playing';
}
