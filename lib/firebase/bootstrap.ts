import { resetFirebaseAppCheck } from './app-check.js';
import { isFirebaseConfigured } from './config.js';
import { bootstrapFirebaseConnection, type FirebaseConnectionResult } from './connection.js';

let bootstrapPromise: Promise<FirebaseConnectionResult> | null = null;

/**
 * Clear cached bootstrap result (e.g. retry after a transient failure).
 */
export function resetFirebaseBootstrap(): void {
  bootstrapPromise = null;
  resetFirebaseAppCheck();
}

/**
 * Initialize Firebase Auth + verify RTDB once per app launch.
 */
export function bootstrapFirebase(): Promise<FirebaseConnectionResult> {
  if (!isFirebaseConfigured()) {
    return Promise.resolve({
      status: 'not_configured',
      errorMessage: 'Missing EXPO_PUBLIC_FIREBASE_* in .env',
    });
  }

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapFirebaseConnection();
  }
  return bootstrapPromise;
}
