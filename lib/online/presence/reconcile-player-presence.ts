import { AppState } from 'react-native';

import { markPlayerOnline, rejoinExistingPlayer } from '../../firebase/game-session-service.js';
import type { PlayerProfile } from '../../profile/player-profile.js';

import { shouldMarkPresenceOnline } from './app-presence-state.js';

/**
 * Rejoin roster membership and mark the player online after rematch or late join.
 * Skips while backgrounded — `online: false` from AppState must not be treated as desync.
 */
export async function reconcilePlayerPresence(
  gameId: string,
  myUid: string,
  profile: PlayerProfile,
): Promise<void> {
  if (!shouldMarkPresenceOnline(AppState.currentState)) {
    return;
  }
  await rejoinExistingPlayer(gameId, myUid, profile);
  if (!shouldMarkPresenceOnline(AppState.currentState)) {
    return;
  }
  await markPlayerOnline(gameId, myUid);
}
