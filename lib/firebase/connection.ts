import { onValue, ref } from 'firebase/database';

import { ensureAnonymousAuth } from './auth.js';
import { ensureFirebaseAppCheck } from './app-check.js';
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
 *
 * FIX: 2026-08 — waitForRtdbConnected crashed (sync unsub) → handle synchronous
 * onValue emission where unsub is called before assignment.
 */
export function waitForRtdbConnected(timeoutMs = RTDB_CONNECT_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve, reject) => {
    const db = getFirebaseDatabase();
    const connectedRef = ref(db, '.info/connected');
    let settled = false;
    // Holder so sync onValue callbacks can call unsubscribe after assignment.
    const unsubRef: { current?: () => void } = {};

    const settle = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubRef.current?.();
      complete();
    };

    const timer = setTimeout(() => {
      settle(() => {
        reject(new Error('RTDB connection timed out'));
      });
    }, timeoutMs);

    unsubRef.current = onValue(
      connectedRef,
      (snapshot) => {
        const val = snapshot.val();
        // diagnostic: .info/connected excluded (not RTDB payload, systemic Firebase state).
        if (val !== true) {
          return;
        }
        settle(() => {
          resolve();
        });
      },
      (error) => {
        settle(() => {
          reject(error);
        });
      },
    );

    // `onValue` may fire synchronously when already connected (e.g. after Wi-Fi
    // switch). In that case settle ran before unsubscribe was assigned — detach now.
    if (settled) {
      unsubRef.current();
    }
  });
}

/**
 * Anonymous auth + RTDB socket ready + server clock sync.
 * Skips probe writes to `_meta`; join/publish validate rules on first use.
 */
export async function bootstrapFirebaseConnection(): Promise<FirebaseConnectionResult> {
  try {
    await ensureFirebaseAppCheck();
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
