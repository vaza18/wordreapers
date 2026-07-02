import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';

import { getFirebaseDatabase } from '@/lib/firebase/init';
import { isFirebaseConfigured } from '@/lib/firebase/config';

/**
 * Live RTDB `.info/connected` for UI offline handling.
 */
export function useRtdbConnected(): boolean {
  const [connected, setConnected] = useState(isFirebaseConfigured());

  useEffect(() => {
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
  }, []);

  return connected;
}
