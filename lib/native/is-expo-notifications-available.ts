import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * True when the dev build links expo-notifications (ExpoPushTokenManager).
 */
export function isExpoNotificationsAvailable(): boolean {
  try {
    return requireOptionalNativeModule('ExpoPushTokenManager') != null;
  } catch {
    return false;
  }
}
