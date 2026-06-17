import type { AppStackScreenOptions } from '@/lib/navigation/stack-header-types';

/** Stack options with a custom back handler. */
export function stackHeaderBack(onPress: () => void): AppStackScreenOptions {
  return {
    headerBackAction: onPress,
  };
}

/** Stack options that show the settings affordance. */
export function stackHeaderSettings(): AppStackScreenOptions {
  return {
    headerShowSettings: true,
  };
}

/** Stack options with back + settings. */
export function stackHeaderWithBackAndSettings(onPress: () => void): AppStackScreenOptions {
  return {
    ...stackHeaderBack(onPress),
    ...stackHeaderSettings(),
  };
}
