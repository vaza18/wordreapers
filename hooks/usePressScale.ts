import { useMemo, useRef } from 'react';
import { Animated } from 'react-native';

const DEFAULT_PRESS_SCALE = 0.9;

/**
 * Spring press-scale for tactile buttons (letter keys, compose actions).
 * Returns the animated value plus press handlers to wire onto a Pressable.
 */
export function usePressScale(pressedScale: number = DEFAULT_PRESS_SCALE) {
  const scale = useRef(new Animated.Value(1)).current;

  return useMemo(() => {
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
  }, [pressedScale, scale]);
}
