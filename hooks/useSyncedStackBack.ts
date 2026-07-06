import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useRef } from 'react';

const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO']);

/**
 * Runs the same back handler for the header button and system back (iOS edge swipe,
 * Android hardware/gesture back). Intercepts stack back gestures when the handler
 * must run custom logic (e.g. `dismissTo('/')` instead of a single pop).
 */
export function useSyncedStackBack(handler: () => void): () => void {
  const navigation = useNavigation();
  const handlerRef = useRef(handler);
  const pendingExitRef = useRef(false);

  handlerRef.current = handler;

  const runBack = useCallback(() => {
    pendingExitRef.current = true;
    handlerRef.current();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = event.data.action.type;
      if (!BACK_ACTIONS.has(actionType)) {
        return;
      }

      // Handler may call dismissTo('/') and pop several screens — allow every pop
      // until this screen unmounts instead of re-entering the handler each time.
      if (pendingExitRef.current) {
        return;
      }

      event.preventDefault();
      runBack();
    });

    return () => {
      unsubscribe();
      pendingExitRef.current = false;
    };
  }, [navigation, runBack]);

  return runBack;
}
