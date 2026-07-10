import { Appearance, AppState, type AppStateStatus, type ColorSchemeName } from 'react-native';

/** OS-reported light/dark preference. */
export type SystemColorScheme = 'light' | 'dark';

/**
 * Read the OS light/dark preference from React Native Appearance API.
 */
export function readSystemColorScheme(): SystemColorScheme | null {
  const scheme = Appearance.getColorScheme();
  if (scheme === 'light' || scheme === 'dark') {
    return scheme;
  }
  return null;
}

/**
 * Follow the OS appearance when the app preference is Auto.
 * Resets any forced in-app scheme so trait collection matches the device.
 */
export function syncSystemAppearanceFollow(): void {
  // RN 0.83+: 'unspecified' follows the OS preference (null is no longer accepted).
  Appearance.setColorScheme('unspecified');
}

/**
 * Subscribe to OS appearance changes (including when returning from background).
 */
export function subscribeSystemColorScheme(
  onChange: (scheme: SystemColorScheme | null) => void,
): () => void {
  const publish = () => {
    onChange(readSystemColorScheme());
  };

  publish();

  const appearanceSubscription = Appearance.addChangeListener(
    ({ colorScheme }: { colorScheme: ColorSchemeName | null | undefined }) => {
      if (colorScheme === 'light' || colorScheme === 'dark') {
        onChange(colorScheme);
        return;
      }
      onChange(null);
    },
  );

  const onAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      publish();
    }
  };

  const appStateSubscription = AppState.addEventListener('change', onAppStateChange);

  return () => {
    appearanceSubscription.remove();
    appStateSubscription.remove();
  };
}
