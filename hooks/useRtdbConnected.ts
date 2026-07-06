import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';

import { getFirebaseDatabase } from '@/lib/firebase/init';
import { isFirebaseConfigured } from '@/lib/firebase/config';

/**
 * Live RTDB `.info/connected` for UI offline handling.
 * Returns true when monitoring is disabled so offline-safe screens are not blocked.
 */
export function useRtdbConnected(enabled = true): boolean {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    if (!isFirebaseConfigured()) {
      setConnected(false);
      return undefined;
    }
    const connectedRef = ref(getFirebaseDatabase(), '.info/connected');
    const unsubscribe = onValue(
      connectedRef,
      (snapshot) => {
        setConnected(snapshot.val() === true);
      },
      () => {
        setConnected(false);
      },
    );
    return unsubscribe;
  }, [enabled]);

  if (!enabled) {
    return true;
  }

  return connected;
}
