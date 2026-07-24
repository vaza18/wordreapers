import { AppState } from 'react-native';

import { rejoinExistingPlayer } from '../../firebase/game-session-service.js';
import { markResultsExited } from '../../firebase/results-coordination-service.js';
import type { PlayerProfile } from '../../profile/player-profile.js';

import { shouldMarkPresenceOnline } from './app-presence-state.js';

/**
 * Rejoin roster membership and mark the player online after rematch or late join.
 * Skips *online* rejoin while backgrounded/inactive — AppState offline must not be
 * treated as desync.
 *
 * Always refreshes the rematch `resultsExitedBy` latch (self leaf write). Multi-sim
 * focus marks the unfocused client `online: false`; without a durable latch peers
 * hide that player from the rematch lobby list while the local client stays via
 * `rematchOptInLatched`. Latch refresh must not wait for AppState `active`.
 *
 * `rejoinExistingPlayer` already applies online presence (including onDisconnect);
 * do not call `markPlayerOnline` again — that doubled onDisconnect + lobby picker reconcile.
 */
export async function reconcilePlayerPresence(
  gameId: string,
  myUid: string,
  profile: PlayerProfile,
): Promise<void> {
  // Latch first even when inactive — peers filter lobby by RTDB latch/online, not
  // this client's local rematchOptInLatched flag.
  await markResultsExited(gameId, myUid);
  if (!shouldMarkPresenceOnline(AppState.currentState)) {
    return;
  }
  await rejoinExistingPlayer(gameId, myUid, profile);
}
