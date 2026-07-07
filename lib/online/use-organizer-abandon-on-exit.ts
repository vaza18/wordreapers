import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef } from 'react';

import { organizerLeaveWaitingLobby } from '../firebase/game-session-service.js';
import type { GameSession, GameSessionStatus } from '../firebase/types.js';
import {
  shouldSkipWaitingAbandonOnBack,
  type BackNavigationState,
} from './should-skip-waiting-abandon-on-back.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';

const ORGANIZER_EXIT_BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO']);

// INVARIANT (see docs/known-issues.md — 2026-06 Organizer waiting room deleted on app background): abandon only on back navigation, not AppState.
/**
 * Drop waiting rooms when the organizer leaves lobby via back navigation.
 * Screen lock / app background must not delete the room — use exitOnlineToHome for explicit leave.
 */
export function useOrganizerAbandonWaitingOnExit(
  gameId: string,
  organizerUid: string | null | undefined,
  session: GameSession | null | undefined,
  sessionStatus: GameSessionStatus | undefined,
  enabled: boolean,
): void {
  const navigation = useNavigation();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!enabled || !organizerUid || !gameId || sessionStatus !== 'waiting') {
      return undefined;
    }

    setOrganizerWaitingRoom(gameId);

    const runCleanup = () => {
      const liveSession = sessionRef.current;
      if (!liveSession) {
        return;
      }
      void organizerLeaveWaitingLobby(gameId, organizerUid, liveSession).then(() => {
        setOrganizerWaitingRoom(null);
      });
    };

    const onBack = navigation.addListener('beforeRemove', (e) => {
      const actionType = e.data?.action?.type;
      if (!actionType || !ORGANIZER_EXIT_BACK_ACTIONS.has(actionType)) {
        return;
      }
      const navState = navigation.getState() as BackNavigationState | undefined;
      if (navState && shouldSkipWaitingAbandonOnBack(navState, gameId)) {
        return;
      }
      runCleanup();
    });

    return () => {
      onBack();
    };
  }, [enabled, gameId, navigation, organizerUid, sessionStatus]);
}
