import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { resolveFirebaseAppId } from './app-ids.js';

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
  firebaseAppIdAndroid?: string;
  firebaseAppIdIos?: string;
  firebaseMeasurementId?: string;
  firebaseAppCheckProduction?: boolean;
}

function extraConfig(): FirebaseExtra {
  return Constants.expoConfig?.extra ?? {};
}

function hasPlatformAppId(extra: FirebaseExtra): boolean {
  if (Platform.OS === 'ios') {
    return Boolean(extra.firebaseAppIdIos?.trim());
  }
  if (Platform.OS === 'android') {
    return Boolean(extra.firebaseAppIdAndroid?.trim());
  }
  return false;
}

function configFromExtra(): FirebasePublicConfig | null {
  const extra = extraConfig();
  if (
    !extra.firebaseApiKey ||
    !extra.firebaseDatabaseURL ||
    !extra.firebaseProjectId ||
    !hasPlatformAppId(extra)
  ) {
    return null;
  }
  return {
    apiKey: extra.firebaseApiKey,
    authDomain: extra.firebaseAuthDomain ?? '',
    databaseURL: extra.firebaseDatabaseURL,
    projectId: extra.firebaseProjectId,
    storageBucket: extra.firebaseStorageBucket ?? '',
    messagingSenderId: extra.firebaseMessagingSenderId ?? '',
    appId: resolveFirebaseAppId({
      androidAppId: extra.firebaseAppIdAndroid,
      iosAppId: extra.firebaseAppIdIos,
    }),
    measurementId: extra.firebaseMeasurementId || undefined,
  };
}

function envString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value?.length ? value : undefined;
}

function platformAppIdEnvName():
  'EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID' | 'EXPO_PUBLIC_FIREBASE_APP_ID_IOS' | null {
  if (Platform.OS === 'ios') {
    return 'EXPO_PUBLIC_FIREBASE_APP_ID_IOS';
  }
  if (Platform.OS === 'android') {
    return 'EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID';
  }
  return null;
}

function configFromProcessEnv(): FirebasePublicConfig | null {
  const apiKey = envString('EXPO_PUBLIC_FIREBASE_API_KEY');
  const databaseURL = envString('EXPO_PUBLIC_FIREBASE_DATABASE_URL');
  const projectId = envString('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const androidAppId = envString('EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID');
  const iosAppId = envString('EXPO_PUBLIC_FIREBASE_APP_ID_IOS');
  const platformAppId =
    Platform.OS === 'ios' ? iosAppId : Platform.OS === 'android' ? androidAppId : undefined;
  if (!apiKey || !databaseURL || !projectId || !platformAppId) {
    return null;
  }
  return {
    apiKey,
    authDomain: envString('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN') ?? '',
    databaseURL,
    projectId,
    storageBucket: envString('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET') ?? '',
    messagingSenderId: envString('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID') ?? '',
    appId: resolveFirebaseAppId({
      androidAppId,
      iosAppId,
    }),
    measurementId: envString('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
  };
}

function resolveFirebaseConfig(): FirebasePublicConfig | null {
  return configFromExtra() ?? configFromProcessEnv();
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
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
    appId: resolveFirebaseAppId({
      androidAppId:
        Platform.OS === 'android' ? requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID') : undefined,
      iosAppId: Platform.OS === 'ios' ? requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID_IOS') : undefined,
    }),
    measurementId: envString('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID'),
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
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
] as const;

function fieldPresence(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed?.length) {
    return 'порожньо';
  }
  return `${trimmed.length} симв.`;
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
  const platformExtraKey =
    Platform.OS === 'ios'
      ? 'firebaseAppIdIos'
      : Platform.OS === 'android'
        ? 'firebaseAppIdAndroid'
        : null;
  const platformEnvName = platformAppIdEnvName();
  const missingExtra = [
    ...REQUIRED_EXTRA_FIELDS.filter((key) => !extra[key]?.trim()),
    ...(platformExtraKey && !extra[platformExtraKey]?.trim() ? [platformExtraKey] : []),
  ];
  const missingRequiredEnv = [
    ...REQUIRED_ENV_VARS.filter((name) => !envString(name)),
    ...(platformEnvName && !envString(platformEnvName) ? [platformEnvName] : []),
  ];
  const missingOptionalEnv = OPTIONAL_ENV_VARS.filter((name) => !envString(name));

  const lines = ['[α] Firebase config'];
  lines.push(
    `expo.extra: ${missingExtra.length ? `немає ${missingExtra.join(', ')}` : 'ключові поля є'}`,
  );
  for (const key of REQUIRED_EXTRA_FIELDS) {
    lines.push(`  ${key}: ${fieldPresence(extra[key])}`);
  }
  if (platformExtraKey) {
    lines.push(`  ${platformExtraKey}: ${fieldPresence(extra[platformExtraKey])}`);
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
