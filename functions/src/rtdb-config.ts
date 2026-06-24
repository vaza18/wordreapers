/** Default Firebase project from `.firebaserc` (single-project deploy). */
const DEFAULT_FIREBASE_PROJECT_ID = 'slovozbyrachy';

/**
 * RTDB instance id for database triggers (must match Firebase Console instance name).
 */
export function rtdbInstanceId(): string {
  const url = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  if (url) {
    try {
      const instance = new URL(url).hostname.split('.')[0];
      if (instance) {
        return instance;
      }
    } catch {
      // fall through
    }
  }

  const project =
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    DEFAULT_FIREBASE_PROJECT_ID;

  return `${project}-default-rtdb`;
}

/** Region where slovozbyrachy RTDB lives (must match trigger + scheduled functions). */
export const RTDB_REGION = 'europe-west1';
