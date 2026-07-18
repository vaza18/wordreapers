import { Platform } from 'react-native';

/**
 * App Check tokens are scoped to a Firebase App. The JS SDK must use the same
 * platform app id as native RNFB (google-services / GoogleService-Info).
 *
 * Values come only from `EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID` / `_IOS`
 * (`.env`, GitHub `release` secrets, or `expo.extra`). Native Android/iOS only.
 */
export function resolveFirebaseAppId(options?: {
  platform?: string;
  androidAppId?: string | null;
  iosAppId?: string | null;
}): string {
  const platform = options?.platform ?? Platform.OS;
  const androidId =
    options?.androidAppId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID?.trim() || '';
  const iosId =
    options?.iosAppId?.trim() || process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS?.trim() || '';

  if (platform === 'ios') {
    if (!iosId) {
      throw new Error(
        'Missing EXPO_PUBLIC_FIREBASE_APP_ID_IOS. Copy .env.example to .env and fill Firebase keys.',
      );
    }
    return iosId;
  }

  if (platform === 'android') {
    if (!androidId) {
      throw new Error(
        'Missing EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID. Copy .env.example to .env and fill Firebase keys.',
      );
    }
    return androidId;
  }

  throw new Error(`Unsupported Firebase platform "${platform}". Use Android or iOS app ids only.`);
}
