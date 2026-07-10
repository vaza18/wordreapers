import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  markPlayerOffline,
  markPlayerOnline,
  subscribePlayerOnlinePresence,
  voluntaryLeaveWaitingLobbyIfMember,
} from '../../firebase/game-session-service.js';

import { shouldMarkPresenceOffline, shouldMarkPresenceOnline } from './app-presence-state.js';
import { consumePresenceHandoff } from './presence-handoff.js';

/**
 * Keep `players/{uid}.online` accurate across reconnects, foreground, and background.
 * Background → offline (not left); active → online. On unmount, marks offline unless
 * another online screen claimed a presence handoff.
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

    if (shouldMarkPresenceOnline(AppState.currentState)) {
      void markPlayerOnline(gameId, uid);
    } else if (shouldMarkPresenceOffline(AppState.currentState)) {
      void markPlayerOffline(gameId, uid);
    }
    const unsubPresence = subscribePlayerOnlinePresence(gameId, uid);
    const appSub = AppState.addEventListener('change', (nextState) => {
      if (shouldMarkPresenceOnline(nextState)) {
        void markPlayerOnline(gameId, uid);
      } else if (shouldMarkPresenceOffline(nextState)) {
        void markPlayerOffline(gameId, uid);
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
