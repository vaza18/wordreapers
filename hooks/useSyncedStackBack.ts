import { useNavigation, usePreventRemoveContext, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useId, useInsertionEffect, useRef } from 'react';

const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO']);

/**
 * Runs the same back handler for the header button and system back (iOS edge swipe,
 * Android hardware/gesture back). Intercepts stack back gestures when the handler
 * must run custom logic (e.g. `dismissTo('/')` instead of a single pop).
 *
 * Registers with native-stack prevent-remove context so iOS cannot pop past this
 * screen natively while JS handles back (SDK 55 / react-native-screens 4.23+).
 */
export function useSyncedStackBack(handler: () => void): () => void {
  const id = useId();
  const navigation = useNavigation();
  const { key: routeKey } = useRoute();
  const { setPreventRemove, notifyPreventRemove } = usePreventRemoveContext();

  const handlerRef = useRef(handler);
  const skipNextRemoveRef = useRef(false);
  const pendingExitRef = useRef(false);

  handlerRef.current = handler;

  useInsertionEffect(() => {
    setPreventRemove(id, routeKey, true);

    return () => {
      setPreventRemove(id, routeKey, false);
    };
  }, [id, routeKey, setPreventRemove]);

  useEffect(() => {
    notifyPreventRemove();

    return () => {
      notifyPreventRemove();
    };
  }, [id, notifyPreventRemove, routeKey]);

  const runBack = useCallback(() => {
    skipNextRemoveRef.current = true;
    pendingExitRef.current = true;
    handlerRef.current();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = event.data.action.type;
      if (!BACK_ACTIONS.has(actionType)) {
        return;
      }

      if (skipNextRemoveRef.current) {
        skipNextRemoveRef.current = false;
        pendingExitRef.current = false;
        return;
      }

      if (pendingExitRef.current) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      runBack();
    });

    return () => {
      unsubscribe();
      pendingExitRef.current = false;
      skipNextRemoveRef.current = false;
    };
  }, [navigation, runBack]);

  return runBack;
}
