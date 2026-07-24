import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useResolvedVisualEffects } from '@/hooks/useResolvedVisualEffects';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import {
  PLAY_TOAST_FADE_OUT_MS,
  type PlayToastItem,
  type PlayToastVariant,
} from '@/hooks/useToastQueue';

/** Space below status bar / header strip (menu + timer row). */
const HEADER_CLEARANCE = 56;
export const PLAY_TOAST_LINE_HEIGHT = 18;
export const PLAY_TOAST_MAX_LINES = 4;
export const PLAY_TOAST_STACK_GAP = spacing.xs;
export const PLAY_TOAST_MIN_HEIGHT = PLAY_TOAST_LINE_HEIGHT + spacing.sm * 2;
/** Upper bound for one toast bubble (multi-line messages). */
export const PLAY_TOAST_MAX_HEIGHT = PLAY_TOAST_LINE_HEIGHT * PLAY_TOAST_MAX_LINES + spacing.sm * 2;
const STACK_SHIFT_MS = 220;
const ENTRANCE_OFFSET = 14;

interface PlaySessionToastStackProps {
  toasts: readonly PlayToastItem[];
  /** Pin stack below the header (default) or above the bottom inset / footer. */
  anchor?: 'top' | 'bottom';
  /** Override top offset when anchor is `top`. */
  topOffset?: number;
  /** Override bottom offset when anchor is `bottom`. */
  bottomOffset?: number;
}

function getToastVariantStyles(
  colors: ThemeColors,
): Record<
  PlayToastVariant,
  { backgroundColor: string; textColor: string; borderColor?: string; borderWidth?: number }
> {
  return {
    default: {
      backgroundColor: colors.sessionToastBg,
      textColor: colors.sessionToastText,
      borderColor: colors.borderSecondary,
      borderWidth: 1,
    },
    success: {
      backgroundColor: colors.accent,
      textColor: colors.textOnAccent,
    },
    warning: {
      backgroundColor: colors.alert,
      textColor: colors.textOnAccent,
    },
  };
}

function createPlayToastStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      left: 0,
      right: 0,
    },
    toastWrap: {
      width: '100%',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 8,
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 12,
    },
    toastText: {
      fontSize: 14,
      lineHeight: PLAY_TOAST_LINE_HEIGHT,
      fontWeight: '600',
      textAlign: 'center',
      flexShrink: 1,
    },
  });
}

function computeStackMetrics(
  toasts: readonly PlayToastItem[],
  heightsById: Readonly<Record<string, number>>,
): { offsets: number[]; totalHeight: number } {
  const n = toasts.length;
  if (n === 0) {
    return { offsets: [], totalHeight: 0 };
  }

  const heights = toasts.map((toast) => heightsById[toast.id] ?? PLAY_TOAST_MIN_HEIGHT);
  const offsets = new Array<number>(n).fill(0);

  for (let index = n - 2; index >= 0; index -= 1) {
    offsets[index] = offsets[index + 1] + heights[index + 1]! + PLAY_TOAST_STACK_GAP;
  }

  const totalHeight =
    heights.reduce((sum, height) => sum + height, 0) + (n - 1) * PLAY_TOAST_STACK_GAP;

  return { offsets, totalHeight };
}

function ToastBubble({
  message,
  variant,
  fading,
  stackOffsetY,
  anchor,
  motionEnabled,
  onLayoutHeight,
}: {
  message: string;
  variant: PlayToastVariant;
  fading: boolean;
  stackOffsetY: number;
  anchor: 'top' | 'bottom';
  motionEnabled: boolean;
  onLayoutHeight: (height: number) => void;
}) {
  const { colors } = useTheme();
  const playToastStyles = useThemedStyles(createPlayToastStyles);
  const variantStyle = getToastVariantStyles(colors)[variant];
  const targetTranslateY = anchor === 'top' ? stackOffsetY : 0;
  const opacity = useRef(new Animated.Value(motionEnabled ? 0 : 1)).current;
  const translateY = useRef(
    new Animated.Value(
      motionEnabled
        ? anchor === 'top'
          ? stackOffsetY - ENTRANCE_OFFSET
          : ENTRANCE_OFFSET
        : targetTranslateY,
    ),
  ).current;

  useEffect(() => {
    if (!motionEnabled) {
      translateY.setValue(targetTranslateY);
      // Never revive opacity while fading — stack shifts used to force opacity back to 1.
      if (!fading) {
        opacity.setValue(1);
      }
      return;
    }
    const animations = [
      Animated.timing(translateY, {
        toValue: targetTranslateY,
        duration: STACK_SHIFT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ];
    if (!fading) {
      animations.push(
        Animated.timing(opacity, {
          toValue: 1,
          duration: STACK_SHIFT_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );
    }
    Animated.parallel(animations).start();
  }, [fading, motionEnabled, opacity, targetTranslateY, translateY]);

  useEffect(() => {
    if (!fading) {
      return;
    }
    if (!motionEnabled) {
      opacity.setValue(0);
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: PLAY_TOAST_FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [fading, motionEnabled, opacity]);

  return (
    <Animated.View
      style={[
        playToastStyles.toastSlot,
        anchor === 'top' ? { top: 0 } : { bottom: stackOffsetY },
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View
        onLayout={(event) => {
          onLayoutHeight(event.nativeEvent.layout.height);
        }}
        style={[
          playToastStyles.toastWrap,
          { backgroundColor: variantStyle.backgroundColor },
          variantStyle.borderWidth != null
            ? { borderColor: variantStyle.borderColor, borderWidth: variantStyle.borderWidth }
            : null,
        ]}
      >
        <Text
          style={[playToastStyles.toastText, { color: variantStyle.textColor }]}
          numberOfLines={PLAY_TOAST_MAX_LINES}
        >
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

/**
 * Stacked play toasts below the header or above the footer; each new toast pushes older ones.
 */
export function PlaySessionToastStack({
  toasts,
  anchor = 'top',
  topOffset,
  bottomOffset,
}: PlaySessionToastStackProps) {
  const insets = useSafeAreaInsets();
  const { generalMotion } = useResolvedVisualEffects();
  const playToastStyles = useThemedStyles(createPlayToastStyles);
  const [heightsById, setHeightsById] = useState<Record<string, number>>({});

  useEffect(() => {
    setHeightsById((current) => {
      const activeIds = new Set(toasts.map((toast) => toast.id));
      let changed = false;
      const next = { ...current };
      for (const id of Object.keys(next)) {
        if (!activeIds.has(id)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [toasts]);

  const handleLayoutHeight = useCallback((id: string, height: number) => {
    setHeightsById((current) => (current[id] === height ? current : { ...current, [id]: height }));
  }, []);

  const { offsets, totalHeight } = useMemo(
    () => computeStackMetrics(toasts, heightsById),
    [heightsById, toasts],
  );

  if (toasts.length === 0) {
    return null;
  }

  const edgeStyle =
    anchor === 'top'
      ? { top: topOffset ?? insets.top + spacing.md + HEADER_CLEARANCE }
      : { bottom: insets.bottom + (bottomOffset ?? spacing.md) };

  return (
    <View
      pointerEvents="none"
      style={[
        playToastStyles.stack,
        edgeStyle,
        {
          height: totalHeight,
        },
      ]}
    >
      {toasts.map((toast, index) => (
        <ToastBubble
          key={toast.id}
          message={toast.message}
          variant={toast.variant}
          fading={toast.fading}
          stackOffsetY={offsets[index] ?? 0}
          anchor={anchor}
          motionEnabled={generalMotion}
          onLayoutHeight={(height) => {
            handleLayoutHeight(toast.id, height);
          }}
        />
      ))}
    </View>
  );
}
