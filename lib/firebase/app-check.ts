import { Platform } from 'react-native';

import { isFirebaseConfigured } from './config.js';
import { getFirebaseApp } from './init.js';
import { resolveNativeAppCheckTokenForJsSdk } from './app-check-resolve-token.js';
import { hasNativeFirebaseAppModule } from './has-native-firebase-app-module.js';
import type { NativeAppCheckTokenGetter } from './native-app-check-native.js';

let initPromise: Promise<void> | null = null;
let jsSdkAppCheckAttached = false;

/**
 * Clear sticky App Check init so `forceRetry` can re-run native attestation.
 * Does not detach an already-initialized JS SDK App Check instance.
 */
export function resetFirebaseAppCheck(): void {
  initPromise = null;
}

export { resolveNativeAppCheckTokenForJsSdk } from './app-check-resolve-token.js';

/**
 * Native attestation (Play Integrity / App Attest) plus JS SDK bridge so RTDB + Auth
 * attach App Check tokens on every request.
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

  initPromise = initNativeAppCheck().catch((error) => {
    initPromise = null;
    throw error;
  });
  return initPromise;
}

async function initNativeAppCheck(): Promise<void> {
  if (!hasNativeFirebaseAppModule()) {
    if (__DEV__) {
      console.warn(
        '[firebase] Native module RNFBAppModule missing — App Check skipped. Rebuild dev client: npm run ios or npm run android (not Expo Go).',
      );
    }
    return;
  }

  getFirebaseApp();

  const { createNativeAppCheckSession } = await import('./native-app-check-native.js');
  const { nativeAppCheck, getNativeAppCheckToken } = await createNativeAppCheckSession();

  await attachJsSdkAppCheck(nativeAppCheck, getNativeAppCheckToken);
}

async function attachJsSdkAppCheck(
  nativeAppCheck: unknown,
  getNativeAppCheckToken: NativeAppCheckTokenGetter,
): Promise<void> {
  if (jsSdkAppCheckAttached) {
    return;
  }

  const { CustomProvider, initializeAppCheck } = await import('firebase/app-check');
  const firebaseApp = getFirebaseApp();

  initializeAppCheck(firebaseApp, {
    provider: new CustomProvider({
      getToken: () => resolveNativeAppCheckTokenForJsSdk(nativeAppCheck, getNativeAppCheckToken),
    }),
    isTokenAutoRefreshEnabled: true,
  });

  jsSdkAppCheckAttached = true;
}
