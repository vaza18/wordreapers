import type { NativeStackNavigationOptions } from 'expo-router';

/** Extra options read by {@link StackHeaderBar}. */
export type AppStackHeaderOptions = {
  /** Custom back handler; when set, the back button is shown. */
  headerBackAction?: () => void;
  /** Show the settings gear in the top-right corner. */
  headerShowSettings?: boolean;
};

/** Native stack options including custom header chrome flags. */
export type AppStackScreenOptions = NativeStackNavigationOptions & AppStackHeaderOptions;
