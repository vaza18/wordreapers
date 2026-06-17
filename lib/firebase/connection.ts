import { onValue, ref } from 'firebase/database';

import { ensureAnonymousAuth } from './auth.js';
import { getFirebaseDatabase } from './init.js';
import { startServerClockSync } from './server-clock.js';

export type FirebaseConnectionStatus = 'idle' | 'ok' | 'error' | 'not_configured';

export interface FirebaseConnectionResult {
  status: FirebaseConnectionStatus;
  uid?: string;
  errorMessage?: string;
}

const RTDB_CONNECT_TIMEOUT_MS = 12_000;

/**
 * Wait until RTDB reports connected (`.info/connected`), with timeout.
 * No test writes — write permissions are validated on the first real game action.
 */
export function waitForRtdbConnected(timeoutMs = RTDB_CONNECT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getFirebaseDatabase();
    const connectedRef = ref(db, '.info/connected');
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      unsub();
      reject(new Error('RTDB connection timed out'));
    }, timeoutMs);

    const unsub = onValue(
      connectedRef,
      (snapshot) => {
        if (snapshot.val() !== true || settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsub();
        resolve();
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        unsub();
        reject(error);
      },
    );
  });
}

/**
 * Anonymous auth + RTDB socket ready + server clock sync.
 * Skips probe writes to `_meta`; join/publish validate rules on first use.
 */
export async function bootstrapFirebaseConnection(): Promise<FirebaseConnectionResult> {
  try {
    const user = await ensureAnonymousAuth();
    await waitForRtdbConnected();
    startServerClockSync();
    return { status: 'ok', uid: user.uid };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = message.includes('PERMISSION_DENIED')
      ? ' Опублікуй rules з firebase/database.rules.json у Firebase Console → Realtime Database → Rules.'
      : '';
    return { status: 'error', errorMessage: `${message}${hint}` };
  }
}
