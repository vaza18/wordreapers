import { signInAnonymously, signOut, type User } from 'firebase/auth';

import { isFirebaseConfigured } from './config.js';
import { getFirebaseAuth } from './init.js';

/**
 * Ensure the user has a Firebase Auth session (anonymous sign-in).
 */
export async function ensureAnonymousAuth(): Promise<User> {
  const { ensureFirebaseAppCheck } = await import('./app-check.js');
  await ensureFirebaseAppCheck();
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * Current Firebase uid, or null if not signed in.
 */
export function getFirebaseUid(): string | null {
  return getFirebaseAuth().currentUser?.uid ?? null;
}

/** Signed-in account (not anonymous) — cloud stats in RTDB. */
export function isRegisteredFirebaseUser(): boolean {
  const user = getFirebaseAuth().currentUser;
  return user != null && !user.isAnonymous;
}

/** End the persisted Firebase Auth session on this device (no-op when offline / not configured). */
export async function signOutFirebaseAuth(): Promise<void> {
  if (!isFirebaseConfigured()) {
    return;
  }
  const auth = getFirebaseAuth();
  if (auth.currentUser) {
    await signOut(auth);
  }
}
