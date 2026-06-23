import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import type { HeaderIconProps } from '@/components/HeaderIcons';

import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  Icon?: ComponentType<HeaderIconProps>;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    segment: {
      flex: 1,
      borderRadius: radii.sm,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
    },
    segmentActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    segmentIdle: {
      backgroundColor: colors.backgroundPrimary,
      borderColor: colors.borderSecondary,
    },
    label: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textPrimary,
    },
    labelActive: {
      color: colors.textOnAccent,
    },
  });
}

/**
 * Three-way segmented control (e.g. parking mode).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.Icon;
        const iconColor = active ? colors.textOnAccent : colors.textPrimary;

        return (
          <FeedbackPressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              onChange(option.value);
            }}
            style={[styles.segment, active ? styles.segmentActive : styles.segmentIdle]}
          >
            {Icon ? (
              <Icon size={20} color={iconColor} />
            ) : (
              <Text style={[styles.label, active ? styles.labelActive : null]}>{option.label}</Text>
            )}
          </FeedbackPressable>
        );
      })}
    </View>
  );
}
