import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';

import { colors, spacing } from '@/constants/theme';
import { FEEDBACK_MODES, type FeedbackMode } from '@/lib/settings/feedback-mode';

interface FeedbackModePickerProps {
  label: string;
  hint?: string;
  value: FeedbackMode;
  onChange: (value: FeedbackMode) => void;
}

/**
 * Four-option picker for haptic/sound feedback (none · vibration · sound · both).
 */
export function FeedbackModePicker({ label, hint, value, onChange }: FeedbackModePickerProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.options}>
        {FEEDBACK_MODES.map((mode) => {
          const active = mode === value;
          return (
            <FeedbackPressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onChange(mode);
              }}
              style={[styles.option, active ? styles.optionActive : styles.optionIdle]}
            >
              <Text style={[styles.optionLabel, active ? styles.optionLabelActive : null]}>
                {t(`settings.feedbackMode.${mode}`)}
              </Text>
            </FeedbackPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  option: {
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  optionActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  optionIdle: {
    backgroundColor: colors.backgroundPrimary,
    borderColor: colors.borderSecondary,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  optionLabelActive: {
    color: '#FFFFFF',
  },
});
