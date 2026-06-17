import Constants, { ExecutionEnvironment } from 'expo-constants';
import { setStatusBarHidden } from 'expo-status-bar';
import { AppState, Platform, StatusBar as RNStatusBar } from 'react-native';

/**
 * True when running inside Expo Go (Store Client) — cannot hide the host app's status bar.
 */
export function isExpoGoHost(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * Hide the status bar in standalone / dev builds. No-op effect in Expo Go host UI.
 */
export function applyImmersiveStatusBar(): void {
  setStatusBarHidden(true, 'none');
  RNStatusBar.setHidden(true, 'none');
  if (Platform.OS === 'android') {
    RNStatusBar.setTranslucent(true);
    RNStatusBar.setBackgroundColor('transparent', false);
  }
}

/**
 * Re-apply when app returns to foreground (some devices restore the status bar).
 */
export function subscribeImmersiveStatusBar(): () => void {
  applyImmersiveStatusBar();
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      applyImmersiveStatusBar();
    }
  });
  return () => {
    subscription.remove();
  };
}
