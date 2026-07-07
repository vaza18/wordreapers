import { useCallback, useMemo, useRef } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { playButtonFeedback } from '@/lib/feedback/game-feedback';
import { useSettingsStore } from '@/store/settings-store';

export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 20;

const TRACK_HEIGHT = 6;
/** Match native Switch thumb diameter on each platform. */
const THUMB_SIZE = Platform.select({ ios: 28, android: 20, default: 28 }) ?? 28;
const THUMB_RADIUS = THUMB_SIZE / 2;
const TRACK_TOP = (THUMB_SIZE - TRACK_HEIGHT) / 2;

interface DurationSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  valueSuffix?: string;
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    block: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    trackHit: {
      flex: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingVertical: spacing.sm,
      paddingHorizontal: THUMB_RADIUS,
    },
    sliderTrack: {
      flex: 1,
      height: THUMB_SIZE,
      justifyContent: 'center',
    },
    track: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: TRACK_TOP,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: colors.controlTrack,
    },
    trackFill: {
      position: 'absolute',
      left: 0,
      top: TRACK_TOP,
      height: TRACK_HEIGHT,
      backgroundColor: colors.accent,
      borderRadius: TRACK_HEIGHT / 2,
    },
    thumb: {
      position: 'absolute',
      top: 0,
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_RADIUS,
      backgroundColor: colors.switchThumbOn,
      ...Platform.select({
        web: {
          boxShadow: '0px 2px 2px rgba(0, 0, 0, 0.22)',
        },
        default: {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.22,
          shadowRadius: 2,
          elevation: 3,
        },
      }),
    },
    value: {
      minWidth: 52,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      textAlign: 'right',
    },
  });
}

/**
 * Draggable duration picker (1-minute steps), matching setup mockup screen 3.
 */
export function DurationSlider({
  label,
  value,
  onChange,
  min = DURATION_MIN_MINUTES,
  max = DURATION_MAX_MINUTES,
  valueSuffix = '',
}: DurationSliderProps) {
  const styles = useThemedStyles(createStyles);
  const buttonFeedback = useSettingsStore((state) => state.buttonFeedback);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const clampedValue = clampMinutes(value, min, max);

  const setValueFromLocationX = useCallback(
    (locationX: number) => {
      const width = trackWidthRef.current;
      if (width <= 0) {
        return;
      }
      const ratio = Math.max(0, Math.min(1, (locationX - THUMB_RADIUS) / width));
      const next = clampMinutes(min + ratio * (max - min), min, max);
      if (next !== valueRef.current) {
        onChange(next);
      }
    },
    [max, min, onChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          playButtonFeedback(buttonFeedback);
          setValueFromLocationX(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => {
          setValueFromLocationX(event.nativeEvent.locationX);
        },
      }),
    [buttonFeedback, setValueFromLocationX],
  );

  const fillPercent = ((clampedValue - min) / (max - min)) * 100;

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View
          style={styles.trackHit}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{
            min,
            max,
            now: clampedValue,
            text: `${clampedValue}${valueSuffix}`,
          }}
          {...panResponder.panHandlers}
        >
          <View
            style={styles.sliderTrack}
            onLayout={(event) => {
              trackWidthRef.current = event.nativeEvent.layout.width;
            }}
          >
            <View style={styles.track} />
            <View style={[styles.trackFill, { width: `${fillPercent}%` }]} />
            <View
              style={[
                styles.thumb,
                {
                  left: `${fillPercent}%`,
                  transform: [{ translateX: -THUMB_RADIUS }],
                  pointerEvents: 'none',
                },
              ]}
            />
          </View>
        </View>
        <Text style={styles.value}>
          {clampedValue}
          {valueSuffix}
        </Text>
      </View>
    </View>
  );
}
