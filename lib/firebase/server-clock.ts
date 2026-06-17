import { onValue, ref } from 'firebase/database';

import { getFirebaseDatabase } from './init.js';

let serverTimeOffsetMs = 0;
let unsubscribe: (() => void) | null = null;

/**
 * Subscribe to Firebase estimated server clock offset (ms added to local Date.now()).
 */
export function startServerClockSync(): () => void {
  if (unsubscribe) {
    return unsubscribe;
  }
  const offsetRef = ref(getFirebaseDatabase(), '.info/serverTimeOffset');
  unsubscribe = onValue(offsetRef, (snapshot) => {
    const offset = snapshot.val();
    serverTimeOffsetMs = typeof offset === 'number' ? offset : 0;
  });
  return unsubscribe;
}

/** Current time aligned with Firebase server (for shared round timers). */
export function getServerNow(): number {
  return Date.now() + serverTimeOffsetMs;
}
