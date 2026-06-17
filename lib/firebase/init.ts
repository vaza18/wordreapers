import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReactNativePersistence } from '@firebase/auth/dist/rn/index.js';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';

import { isFirebaseConfigured, loadFirebaseConfig } from './config.js';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;

/**
 * Firebase app singleton (Expo / React Native, JS SDK).
 */
export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Add EXPO_PUBLIC_FIREBASE_* to .env');
  }
  if (app) {
    return app;
  }
  const existing = getApps();
  if (existing.length > 0) {
    app = existing[0]!;
    return app;
  }
  app = initializeApp(loadFirebaseConfig());
  return app;
}

/**
 * Firebase Auth with AsyncStorage persistence (do not call `getAuth` before this).
 */
export function getFirebaseAuth(): Auth {
  if (auth) {
    return auth;
  }
  const firebaseApp = getFirebaseApp();
  try {
    auth = initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: string }).code)
        : '';
    if (code === 'auth/already-initialized') {
      auth = getAuth(firebaseApp);
    } else {
      throw error;
    }
  }
  return auth;
}

/**
 * Realtime Database instance.
 */
export function getFirebaseDatabase(): Database {
  if (database) {
    return database;
  }
  database = getDatabase(getFirebaseApp());
  return database;
}
