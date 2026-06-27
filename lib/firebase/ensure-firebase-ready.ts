import { isFirebaseConfigured } from './config.js';
import { bootstrapFirebase, resetFirebaseBootstrap } from './bootstrap.js';
import type { FirebaseConnectionResult } from './connection.js';

/**
 * Bootstrap Firebase Auth + RTDB when entering online flows or running sync.
 * Returns the bootstrap result (including error details when status !== 'ok').
 */
export async function ensureFirebaseReady(options?: {
  forceRetry?: boolean;
}): Promise<FirebaseConnectionResult> {
  if (!isFirebaseConfigured()) {
    return { status: 'not_configured', errorMessage: 'Missing EXPO_PUBLIC_FIREBASE_* in .env' };
  }
  if (options?.forceRetry) {
    resetFirebaseBootstrap();
  }
  return bootstrapFirebase();
}
