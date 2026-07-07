import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  markPlayerOnline,
  subscribePlayerOnlinePresence,
  voluntaryLeaveWaitingLobbyIfMember,
} from '../../firebase/game-session-service.js';

import { consumePresenceHandoff } from './presence-handoff.js';

/**
 * Keep `players/{uid}.online` accurate across reconnects and app foreground.
 * On unmount, marks offline unless another online screen claimed a presence handoff.
 */
export function usePlayerOnlinePresence(
  gameId: string | undefined,
  uid: string | undefined,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled || !gameId || !uid) {
      return undefined;
    }

    void markPlayerOnline(gameId, uid);
    const unsubPresence = subscribePlayerOnlinePresence(gameId, uid);
    const appSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void markPlayerOnline(gameId, uid);
      }
    });

    return () => {
      unsubPresence();
      appSub.remove();
      if (consumePresenceHandoff(gameId)) {
        return;
      }
      void voluntaryLeaveWaitingLobbyIfMember(gameId, uid);
    };
  }, [enabled, gameId, uid]);
}
