import { NativeModules, Platform } from 'react-native';

/** True when the dev client / store binary includes react-native-firebase native code. */
export function hasNativeFirebaseAppModule(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return false;
  }
  return Boolean((NativeModules as { RNFBAppModule?: unknown }).RNFBAppModule);
}
