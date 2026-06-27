/**
 * Production App Check = Play Integrity (Android) + App Attest (iOS).
 * Debug provider for Metro / dev client and sideload testing.
 */
export function useProductionAppCheckProviders(): boolean {
  const override = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_PRODUCTION?.trim();
  if (override === 'true') {
    return true;
  }
  if (override === 'false') {
    return false;
  }

  const releaseProfile =
    process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';
  const inDevBundle = typeof __DEV__ !== 'undefined' && __DEV__;
  return releaseProfile && !inDevBundle;
}
