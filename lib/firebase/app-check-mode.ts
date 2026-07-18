import Constants from 'expo-constants';

/**
 * Production App Check = Play Integrity (Android) + App Attest (iOS).
 * Debug provider for Metro / dev client and sideload testing.
 *
 * Only two sources (both available in the client JS bundle):
 * 1. `EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION` (inlined by Metro / EAS env)
 * 2. `expo.extra.firebaseAppCheckProduction` (baked from the same EXPO_PUBLIC_*
 *    flag by `with-firebase-extra` — never from APP_VARIANT)
 *
 * Do not use raw `APP_VARIANT` / `EAS_BUILD_PROFILE` here or in the plugin.
 */
export function useProductionAppCheckProviders(): boolean {
  const override = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION?.trim();
  if (override === 'true') {
    return true;
  }
  if (override === 'false') {
    return false;
  }

  const extra = Constants.expoConfig?.extra as { firebaseAppCheckProduction?: unknown } | undefined;
  if (extra?.firebaseAppCheckProduction === true) {
    return true;
  }
  if (extra?.firebaseAppCheckProduction === false) {
    return false;
  }

  return false;
}
