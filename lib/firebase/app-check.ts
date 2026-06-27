import { Platform } from 'react-native';

import { isFirebaseConfigured } from './config.js';
import { getFirebaseApp } from './init.js';
import { useProductionAppCheckProviders } from './app-check-mode.js';

let initPromise: Promise<void> | null = null;

/**
 * Native App Check (Play Integrity / App Attest in production; debug token in dev).
 * Requires `google-services.json` + `GoogleService-Info.plist` and a native rebuild.
 */
export async function ensureFirebaseAppCheck(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }
  if (!isFirebaseConfigured()) {
    return;
  }

  initPromise = initNativeAppCheck();
  return initPromise;
}

async function initNativeAppCheck(): Promise<void> {
  getFirebaseApp();

  const { getApp } = await import('@react-native-firebase/app');
  const { initializeAppCheck, ReactNativeFirebaseAppCheckProvider } =
    await import('@react-native-firebase/app-check');

  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
  const production = useProductionAppCheckProviders();

  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure({
    android: {
      provider: production ? 'playIntegrity' : 'debug',
      ...(debugToken ? { debugToken } : {}),
    },
    apple: {
      provider: production ? 'appAttestWithDeviceCheckFallback' : 'debug',
      ...(debugToken ? { debugToken } : {}),
    },
  });

  await initializeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}
