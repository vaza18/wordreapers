import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  cancelPlayerOnlineOnDisconnect,
  markPlayerOnline,
  subscribePlayerOnlinePresence,
} from '../firebase/game-session-service.js';

/**
 * Keep `players/{uid}.online` accurate across reconnects and app foreground.
 * Cleanup cancels onDisconnect only — no forced offline (avoids Strict Mode remount races).
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
      void cancelPlayerOnlineOnDisconnect(gameId, uid);
    };
  }, [enabled, gameId, uid]);
}
