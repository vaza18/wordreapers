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

/** Temporary alpha UI: append missing-key diagnostics to Firebase config errors. */
export const FIREBASE_CONFIG_ALPHA_DIAGNOSTICS = true;

const REQUIRED_EXTRA_FIELDS = [
  'firebaseApiKey',
  'firebaseDatabaseURL',
  'firebaseProjectId',
] as const satisfies readonly (keyof FirebaseExtra)[];

const REQUIRED_ENV_VARS = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
] as const;

const OPTIONAL_ENV_VARS = [
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
] as const;

function fieldPresence(value: string | undefined): string {
  if (!value?.length) {
    return 'порожньо';
  }
  return `${value.length} симв.`;
}

/**
 * Human-readable gap report for alpha debugging (no secret values).
 * Returns null when Firebase config resolves successfully.
 */
export function describeFirebaseConfigGap(): string | null {
  if (isFirebaseConfigured()) {
    return null;
  }

  const extra = extraConfig();
  const missingExtra = REQUIRED_EXTRA_FIELDS.filter((key) => !extra[key]?.length);
  const missingRequiredEnv = REQUIRED_ENV_VARS.filter((name) => !envString(name));
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter((name) => !envString(name));

  const lines = ['[α] Firebase config'];
  lines.push(
    `expo.extra: ${missingExtra.length ? `немає ${missingExtra.join(', ')}` : 'ключові поля є'}`,
  );
  for (const key of REQUIRED_EXTRA_FIELDS) {
    lines.push(`  ${key}: ${fieldPresence(extra[key])}`);
  }

  lines.push(
    `process.env: ${
      missingRequiredEnv.length
        ? `немає ${missingRequiredEnv.join(', ')}`
        : 'ключові EXPO_PUBLIC_* є'
    }`,
  );
  if (missingOptionalEnv.length > 0) {
    lines.push(`  також порожні: ${missingOptionalEnv.join(', ')}`);
  }

  const source = configFromExtra()
    ? 'expo.extra'
    : configFromProcessEnv()
      ? 'process.env'
      : 'немає';
  lines.push(`resolve(): ${source}`);
  lines.push('Збірка: .env / eas env:pull → eas build --profile production');

  return lines.join('\n');
}
