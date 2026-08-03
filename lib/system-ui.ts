import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';

/**
 * Hide the status bar and re-apply when the app returns to foreground
 * (some devices restore the status bar).
 */
export function subscribeImmersiveStatusBar(): () => void {
  StatusBar.setHidden(true, 'none');
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      StatusBar.setHidden(true, 'none');
    }
  });
  return () => {
    subscription.remove();
  };
}
