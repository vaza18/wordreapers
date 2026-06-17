import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { abandonWaitingGameSession } from '../firebase/game-session-service.js';
import type { GameSessionStatus } from '../firebase/types.js';
import {
  shouldSkipWaitingAbandonOnBack,
  type BackNavigationState,
} from './should-skip-waiting-abandon-on-back.js';
import { setOrganizerWaitingRoom } from './organizer-waiting-room.js';

const ORGANIZER_EXIT_BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO']);

/**
 * Drop waiting rooms when the organizer leaves lobby (back, home, or app background).
 */
export function useOrganizerAbandonWaitingOnExit(
  gameId: string,
  organizerUid: string | null | undefined,
  sessionStatus: GameSessionStatus | undefined,
  enabled: boolean,
): void {
  const navigation = useNavigation();

  useEffect(() => {
    if (!enabled || !organizerUid || !gameId || sessionStatus !== 'waiting') {
      return undefined;
    }

    setOrganizerWaitingRoom(gameId);

    const runCleanup = () => {
      void abandonWaitingGameSession(gameId, organizerUid).then(() => {
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

    const appSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        runCleanup();
      }
    });

    return () => {
      onBack();
      appSub.remove();
    };
  }, [enabled, gameId, navigation, organizerUid, sessionStatus]);
}
