import { signInAnonymously, type User } from 'firebase/auth';

import { getFirebaseAuth } from './init.js';

/**
 * Ensure the user has a Firebase Auth session (anonymous sign-in).
 */
export async function ensureAnonymousAuth(): Promise<User> {
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
