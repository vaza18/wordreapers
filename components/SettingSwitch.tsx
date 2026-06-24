import { StyleSheet, Switch, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { playButtonFeedback } from '@/lib/feedback/game-feedback';
import { useSettingsStore } from '@/store/settings-store';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface SettingSwitchProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Fired when the row is pressed while disabled (e.g. explain why). */
  onDisabledPress?: () => void;
  /** Smaller secondary styling for inline toggles (e.g. round results). */
  variant?: 'default' | 'compact';
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    labelCompact: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '400',
    },
    hint: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    switchWrap: {
      position: 'relative',
    },
    switchOverlay: {
      ...StyleSheet.absoluteFillObject,
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
      color: colors.textOnAccent,
    },
  });
}

/**
 * Label + switch row from setup mockups.
 */
export function SettingSwitch({
  label,
  hint,
  value,
  onChange,
  disabled = false,
  onDisabledPress,
  variant = 'default',
}: SettingSwitchProps) {
  const buttonFeedback = useSettingsStore((state) => state.buttonFeedback);
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const showDisabledHint = disabled && onDisabledPress != null;

  const switchControl = (
    <View style={styles.switchWrap}>
      <Switch
        accessibilityLabel={label}
        accessibilityHint={hint}
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        trackColor={{ false: colors.switchTrackOff, true: colors.switchTrackOn }}
        thumbColor={value ? colors.switchThumbOn : colors.switchThumbOff}
        ios_backgroundColor={colors.switchTrackOff}
        value={value}
        onValueChange={(next) => {
          if (disabled) {
            return;
          }
          playButtonFeedback(buttonFeedback);
          onChange(next);
        }}
      />
      {showDisabledHint ? (
        <FeedbackPressable
          style={styles.switchOverlay}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onDisabledPress}
        >
          <View />
        </FeedbackPressable>
      ) : null}
    </View>
  );

  const row = (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={[styles.label, variant === 'compact' ? styles.labelCompact : null]}>
          {label}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {switchControl}
    </View>
  );

  if (showDisabledHint) {
    return (
      <FeedbackPressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: true }}
        onPress={onDisabledPress}
      >
        {row}
      </FeedbackPressable>
    );
  }

  return row;
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
  const styles = useThemedStyles(createStyles);

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
