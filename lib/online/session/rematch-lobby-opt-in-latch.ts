import { isRematchWaitingLobbyOptedIn } from '../rematch/rematch-waiting-lobby.js';
import type { GameSession } from '../../firebase/types.js';

/**
 * Whether the lobby client should latch rematch opt-in for this waiting round
 * (query flag or RTDB opt-in evidence).
 */
export function shouldLatchRematchLobbyOptIn(options: {
  session: Pick<GameSession, 'players' | 'resultsExitedBy'> | null | undefined;
  myUid: string;
  justOptedIn?: boolean;
}): boolean {
  if (options.justOptedIn === true) {
    return true;
  }
  if (!options.session || !options.myUid) {
    return false;
  }
  return isRematchWaitingLobbyOptedIn(options.session, options.myUid);
}
