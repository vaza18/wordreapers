import { useCallback, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { playButtonFeedback } from '@/lib/feedback/game-feedback';
import { useSettingsStore } from '@/store/settings-store';

export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 20;

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
      minHeight: 36,
      paddingVertical: spacing.sm,
    },
    track: {
      height: 6,
      borderRadius: radii.sm,
      backgroundColor: colors.controlTrack,
      overflow: 'hidden',
    },
    trackFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radii.sm,
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
      const ratio = Math.max(0, Math.min(1, locationX / width));
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
          onLayout={(event) => {
            trackWidthRef.current = event.nativeEvent.layout.width;
          }}
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
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${fillPercent}%` }]} />
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
