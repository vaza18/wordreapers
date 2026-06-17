import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * True when the dev build includes the ExpoCamera native module (expo-camera).
 */
export function isExpoCameraAvailable(): boolean {
  try {
    return requireOptionalNativeModule('ExpoCamera') != null;
  } catch {
    return false;
  }
}
