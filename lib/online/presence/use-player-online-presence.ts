import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { devLogAction } from '../../debug/dev-log.js';
import {
  markPlayerOffline,
  markPlayerOnline,
  subscribePlayerOnlinePresence,
  voluntaryLeaveWaitingLobbyIfMember,
} from '../../firebase/game-session-service.js';

import {
  shouldMarkPresenceOffline,
  shouldMarkPresenceOnline,
  type PresenceOfflinePolicy,
} from './app-presence-state.js';
import { consumePresenceHandoff } from './presence-handoff.js';

function logPresenceAppState(gameId: string, nextState: AppStateStatus): void {
  if (nextState === 'active') {
    devLogAction('app came to foreground', {
      room: gameId,
      details: `AppState=${nextState}`,
    });
    return;
  }
  if (nextState === 'background') {
    devLogAction('app went to background', {
      room: gameId,
      details: `AppState=${nextState}`,
    });
    return;
  }
  if (nextState === 'inactive') {
    devLogAction('app became inactive', {
      level: 'detail',
      room: gameId,
      details: `AppState=${nextState}`,
    });
  }
}

/**
 * Keep `players/{uid}.online` accurate across reconnects, foreground, and background.
 * Background → offline (not left); active → online. On unmount, marks offline unless
 * another online screen claimed a presence handoff.
 *
 * Lobby should pass `offlinePolicy: 'background-only'` (via `lobbyPresenceOfflinePolicy`)
 * so multi-sim `inactive` does not falsely mark the unfocused peer offline, and so
 * `waiting → playing` does not remount this hook under play policy before handoff.
 * Play keeps the default `background-and-inactive` for iOS lock-screen votes.
 */
export function usePlayerOnlinePresence(
  gameId: string | undefined,
  uid: string | undefined,
  enabled = true,
  offlinePolicy: PresenceOfflinePolicy = 'background-and-inactive',
): void {
  useEffect(() => {
    if (!enabled || !gameId || !uid) {
      return undefined;
    }

    if (shouldMarkPresenceOnline(AppState.currentState)) {
      void markPlayerOnline(gameId, uid);
    } else if (shouldMarkPresenceOffline(AppState.currentState, offlinePolicy)) {
      void markPlayerOffline(gameId, uid);
    }
    const unsubPresence = subscribePlayerOnlinePresence(gameId, uid);
    const appSub = AppState.addEventListener('change', (nextState) => {
      logPresenceAppState(gameId, nextState);
      if (shouldMarkPresenceOnline(nextState)) {
        void markPlayerOnline(gameId, uid);
      } else if (shouldMarkPresenceOffline(nextState, offlinePolicy)) {
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
  }, [enabled, gameId, offlinePolicy, uid]);
}
