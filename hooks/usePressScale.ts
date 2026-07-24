import { useEffect, useMemo, useRef } from 'react';
import { Animated, AppState, type AppStateStatus } from 'react-native';

import { shouldHealPlayUiOnAppState } from '@/lib/game/compose-resume-heal';

const DEFAULT_PRESS_SCALE = 0.9;

/**
 * Spring press-scale for tactile buttons (letter keys, compose actions).
 * Returns the animated value plus press handlers to wire onto a Pressable.
 * Resets to 1 on AppState `active` — native-driver springs can stick after lock/wake.
 */
export function usePressScale(pressedScale: number = DEFAULT_PRESS_SCALE, enabled = true) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (!shouldHealPlayUiOnAppState(next)) {
        return;
      }
      scale.stopAnimation();
      scale.setValue(1);
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
    };
  }, [scale]);

  return useMemo(() => {
    if (!enabled) {
      return {
        scale,
        onPressIn: () => {},
        onPressOut: () => {},
      };
    }

    const animateTo = (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        friction: 6,
        tension: 280,
        useNativeDriver: true,
      }).start();
    };
    return {
      scale,
      onPressIn: () => animateTo(pressedScale),
      onPressOut: () => animateTo(1),
    };
  }, [enabled, pressedScale, scale]);
}
