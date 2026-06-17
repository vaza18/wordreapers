import { StyleSheet, Switch, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { playButtonFeedback } from '@/lib/feedback/game-feedback';
import { useSettingsStore } from '@/store/settings-store';

import { colors, spacing } from '@/constants/theme';

interface SettingSwitchProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Label + switch row from setup mockups.
 */
export function SettingSwitch({ label, hint, value, onChange }: SettingSwitchProps) {
  const buttonFeedback = useSettingsStore((state) => state.buttonFeedback);

  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        trackColor={{ false: colors.borderSecondary, true: colors.accentMuted }}
        thumbColor={value ? colors.accent : colors.textTertiary}
        value={value}
        onValueChange={(next) => {
          playButtonFeedback(buttonFeedback);
          onChange(next);
        }}
      />
    </View>
  );
}

interface StepperProps {
  label: string;
  value: number;
  options: number[];
  suffix?: string;
  onChange: (value: number) => void;
}

/**
 * Discrete stepper for duration and similar numeric settings.
 */
export function Stepper({ label, value, options, suffix, onChange }: StepperProps) {
  return (
    <View style={styles.stepperBlock}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepperRow}>
        {options.map((option) => {
          const active = option === value;
          return (
            <FeedbackPressable
              key={option}
              accessibilityRole="button"
              onPress={() => {
                onChange(option);
              }}
              style={[styles.step, active ? styles.stepActive : styles.stepIdle]}
            >
              <Text style={[styles.stepLabel, active ? styles.stepLabelActive : null]}>
                {option}
                {suffix ?? ''}
              </Text>
            </FeedbackPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  hint: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  stepperBlock: {
    gap: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  step: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  stepActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  stepIdle: {
    backgroundColor: colors.backgroundPrimary,
    borderColor: colors.borderSecondary,
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  stepLabelActive: {
    color: '#FFFFFF',
  },
});
