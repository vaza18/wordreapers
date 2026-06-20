import type { AppStateStatus } from 'react-native';

/** Pause the round when the app leaves the foreground (screen off, home, another app). */
export function shouldTriggerAutoPause(nextState: AppStateStatus, isPlaying: boolean): boolean {
  return nextState === 'background' && isPlaying;
}
