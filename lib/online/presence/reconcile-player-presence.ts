import { markPlayerOnline, rejoinExistingPlayer } from '../../firebase/game-session-service.js';
import type { PlayerProfile } from '../../profile/player-profile.js';

/**
 * Rejoin roster membership and mark the player online after rematch or late join.
 */
export async function reconcilePlayerPresence(
  gameId: string,
  myUid: string,
  profile: PlayerProfile,
): Promise<void> {
  await rejoinExistingPlayer(gameId, myUid, profile);
  await markPlayerOnline(gameId, myUid);
}
