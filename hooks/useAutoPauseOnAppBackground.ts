import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { shouldTriggerAutoPause } from '@/lib/game/auto-pause-on-app-state';

/**
 * Pause the active round when the app goes to background (screen off, home, another app).
 * Does not auto-resume on return — caller handles resume via existing pause UI.
 */
export function useAutoPauseOnAppBackground(isPlaying: boolean, onPause: () => void): void {
  const isPlayingRef = useRef(isPlaying);
  const onPauseRef = useRef(onPause);
  isPlayingRef.current = isPlaying;
  onPauseRef.current = onPause;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (shouldTriggerAutoPause(nextState, isPlayingRef.current)) {
        onPauseRef.current();
      }
    });
    return () => {
      sub.remove();
    };
  }, []);
}
