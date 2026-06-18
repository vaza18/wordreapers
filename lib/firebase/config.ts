import Constants from 'expo-constants';

/**
 * Firebase Web config from Expo public env (see `.env.example`).
 */
export interface FirebasePublicConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

interface FirebaseExtra {
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseDatabaseURL?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseMeasurementId?: string;
}

function extraConfig(): FirebaseExtra {
  return Constants.expoConfig?.extra ?? {};
}

function configFromExtra(): FirebasePublicConfig | null {
  const extra = extraConfig();
  if (!extra.firebaseApiKey || !extra.firebaseDatabaseURL || !extra.firebaseProjectId) {
    return null;
  }
  return {
    apiKey: extra.firebaseApiKey,
    authDomain: extra.firebaseAuthDomain ?? '',
    databaseURL: extra.firebaseDatabaseURL,
    projectId: extra.firebaseProjectId,
    storageBucket: extra.firebaseStorageBucket ?? '',
    messagingSenderId: extra.firebaseMessagingSenderId ?? '',
    appId: extra.firebaseAppId ?? '',
    measurementId: extra.firebaseMeasurementId || undefined,
  };
}

function envString(name: string): string | undefined {
  const value = process.env[name];
  return value?.length ? value : undefined;
}

function configFromProcessEnv(): FirebasePublicConfig | null {
  const apiKey = envString('EXPO_PUBLIC_FIREBASE_API_KEY');
  const databaseURL = envString('EXPO_PUBLIC_FIREBASE_DATABASE_URL');
  const projectId = envString('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!apiKey || !databaseURL || !projectId) {
    return null;
  }
  return {
    apiKey,
    authDomain: envString('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ?? '',
    databaseURL,
    projectId,
    storageBucket: envString('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ?? '',
    messagingSenderId: envString('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ?? '',
    appId: envString('EXPO_PUBLIC_FIREBASE_APP_ID') ?? '',
    measurementId: envString('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
  };
}

function resolveFirebaseConfig(): FirebasePublicConfig | null {
  return configFromExtra() ?? configFromProcessEnv();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill Firebase keys.`);
  }
  return value;
}

/**
 * Load Firebase config (`expo-constants` extra on device builds, else `EXPO_PUBLIC_*`).
 */
export function loadFirebaseConfig(): FirebasePublicConfig {
  const resolved = resolveFirebaseConfig();
  if (resolved) {
    return resolved;
  }

  return {
    apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    databaseURL: requireEnv('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
    projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

/**
 * Return true when all required Firebase config values are present.
 */
export function isFirebaseConfigured(): boolean {
  return resolveFirebaseConfig() != null;
}
