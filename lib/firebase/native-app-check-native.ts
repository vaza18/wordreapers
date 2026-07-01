import { getApp } from '@react-native-firebase/app';
import {
  getToken as getNativeAppCheckToken,
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

import { useProductionAppCheckProviders } from './app-check-mode.js';

export type NativeAppCheckTokenGetter = (
  appCheckInstance: unknown,
  forceRefresh?: boolean,
) => Promise<{ token: string }>;

export interface NativeAppCheckSession {
  nativeAppCheck: unknown;
  getNativeAppCheckToken: NativeAppCheckTokenGetter;
}

/** Configure Play Integrity / App Attest (or debug) via react-native-firebase. */
export async function createNativeAppCheckSession(): Promise<NativeAppCheckSession> {
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

  const nativeAppCheck = await initializeNativeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return {
    nativeAppCheck,
    getNativeAppCheckToken: getNativeAppCheckToken as NativeAppCheckTokenGetter,
  };
}
