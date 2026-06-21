import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';

import { colors, radii, spacing } from '@/constants/theme';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Three-way segmented control (e.g. parking mode).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <FeedbackPressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              onChange(option.value);
            }}
            style={[styles.segment, active ? styles.segmentActive : styles.segmentIdle]}
          >
            <Text style={[styles.label, active ? styles.labelActive : null]}>{option.label}</Text>
          </FeedbackPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
    color: '#FFFFFF',
  },
});
