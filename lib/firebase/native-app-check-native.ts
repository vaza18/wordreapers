import { getApp } from '@react-native-firebase/app';
import {
  getToken,
  initializeAppCheck as initializeNativeAppCheck,
  ReactNativeFirebaseAppCheckProvider,
} from '@react-native-firebase/app-check';

import { useProductionAppCheckProviders } from './app-check-mode.js';
import { buildNativeAppCheckProviderConfig } from './native-app-check-provider-config.js';

export interface NativeAppCheckTokenResult {
  token: string;
}

export type NativeAppCheckTokenGetter = (
  appCheckInstance: unknown,
  forceRefresh?: boolean,
) => Promise<NativeAppCheckTokenResult>;

export interface NativeAppCheckSession {
  nativeAppCheck: unknown;
  getNativeAppCheckToken: NativeAppCheckTokenGetter;
}

/** Configure Play Integrity / App Attest (or debug) via react-native-firebase. */
export async function createNativeAppCheckSession(): Promise<NativeAppCheckSession> {
  const debugToken = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_DEBUG_TOKEN?.trim();
  const production = useProductionAppCheckProviders();

  const provider = new ReactNativeFirebaseAppCheckProvider();
  provider.configure(buildNativeAppCheckProviderConfig(production, debugToken));

  const nativeAppCheck = await initializeNativeAppCheck(getApp(), {
    provider,
    isTokenAutoRefreshEnabled: true,
  });

  return {
    nativeAppCheck,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    getNativeAppCheckToken: getToken as unknown as NativeAppCheckTokenGetter,
  };
}
