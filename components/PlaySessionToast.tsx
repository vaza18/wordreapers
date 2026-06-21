import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/constants/theme';
import { PLAY_TOAST_FADE_OUT_MS, type PlayToastItem } from '@/hooks/useToastQueue';

/** Space below status bar / header strip. */
const HEADER_CLEARANCE = 52;
export const PLAY_TOAST_LINE_HEIGHT = 18;
export const PLAY_TOAST_MAX_LINES = 2;
/** Fixed slot height so stack shifts animate without LayoutAnimation. */
export const PLAY_TOAST_SLOT_HEIGHT =
  PLAY_TOAST_LINE_HEIGHT * PLAY_TOAST_MAX_LINES + spacing.sm * 2;
const STACK_SHIFT_MS = 220;
const ENTRANCE_OFFSET = 14;

interface PlaySessionToastStackProps {
  toasts: readonly PlayToastItem[];
  /** Override top offset (e.g. results screen below stack header). */
  topOffset?: number;
}

function ToastBubble({
  message,
  fading,
  stackSlot,
}: {
  message: string;
  fading: boolean;
  stackSlot: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const stackOffset = stackSlot * PLAY_TOAST_SLOT_HEIGHT;
  const translateY = useRef(new Animated.Value(stackOffset - ENTRANCE_OFFSET)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: stackOffset,
        duration: STACK_SHIFT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: STACK_SHIFT_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, stackOffset, translateY]);

  useEffect(() => {
    if (!fading) {
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: PLAY_TOAST_FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fading, opacity]);

  return (
    <Animated.View
      style={[
        playToastStyles.toastWrap,
        playToastStyles.toastSlot,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <Text style={playToastStyles.toastText}>{message}</Text>
    </Animated.View>
  );
}

/**
 * Stacked play toasts below the header; each new toast pushes older ones down.
 */
export function PlaySessionToastStack({ toasts, topOffset }: PlaySessionToastStackProps) {
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) {
    return null;
  }

  const stackHeight = toasts.length * PLAY_TOAST_SLOT_HEIGHT;
  const top = topOffset ?? insets.top + spacing.md + HEADER_CLEARANCE;

  return (
    <View
      pointerEvents="none"
      style={[
        playToastStyles.stack,
        {
          top,
          height: stackHeight,
        },
      ]}
    >
      {toasts.map((toast, index) => (
        <ToastBubble
          key={toast.id}
          message={toast.message}
          fading={toast.fading}
          stackSlot={toasts.length - 1 - index}
        />
      ))}
    </View>
  );
}

export const playToastStyles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 10000,
    elevation: 10000,
    alignItems: 'center',
  },
  toastSlot: {
    position: 'absolute',
    top: 0,
    height: PLAY_TOAST_SLOT_HEIGHT,
    justifyContent: 'center',
  },
  toastWrap: {
    backgroundColor: 'rgba(26,26,26,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    maxWidth: '100%',
    minHeight: PLAY_TOAST_SLOT_HEIGHT,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  toastText: {
    fontSize: 14,
    lineHeight: PLAY_TOAST_LINE_HEIGHT,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
