import { isFirebaseConfigured } from './config.js';
import { bootstrapFirebase, resetFirebaseBootstrap } from './bootstrap.js';
import type { FirebaseConnectionResult } from './connection.js';

/**
 * Bootstrap Firebase Auth + RTDB when entering online flows or running sync.
 * Returns null when Firebase is not configured or bootstrap failed.
 */
export async function ensureFirebaseReady(options?: {
  forceRetry?: boolean;
}): Promise<FirebaseConnectionResult | null> {
  if (!isFirebaseConfigured()) {
    return { status: 'not_configured', errorMessage: 'Missing EXPO_PUBLIC_FIREBASE_* in .env' };
  }
  if (options?.forceRetry) {
    resetFirebaseBootstrap();
  }
  const result = await bootstrapFirebase();
  if (result.status !== 'ok') {
    return null;
  }
  return result;
}
