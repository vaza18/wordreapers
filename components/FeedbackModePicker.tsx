import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import {
  FeedbackBothIcon,
  FeedbackNoneIcon,
  FeedbackSoundIcon,
  FeedbackVibrationIcon,
} from '@/components/FeedbackIcons';
import type { HeaderIconProps } from '@/components/HeaderIcons';
import { SegmentedControl } from '@/components/SegmentedControl';

import { spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';
import { FEEDBACK_MODES, type FeedbackMode } from '@/lib/settings/feedback-mode';

const FEEDBACK_MODE_ICONS: Record<FeedbackMode, ComponentType<HeaderIconProps>> = {
  none: FeedbackNoneIcon,
  vibration: FeedbackVibrationIcon,
  sound: FeedbackSoundIcon,
  both: FeedbackBothIcon,
};

interface FeedbackModePickerProps {
  label: string;
  hint?: string;
  value: FeedbackMode;
  onChange: (value: FeedbackMode) => void;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
  });
}

/**
 * Four-option picker for haptic/sound feedback (none · vibration · sound · both).
 */
export function FeedbackModePicker({ label, hint, value, onChange }: FeedbackModePickerProps) {
  const { t } = useTranslation();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <SegmentedControl
        options={FEEDBACK_MODES.map((mode) => ({
          value: mode,
          label: t(`settings.feedbackMode.${mode}`),
          Icon: FEEDBACK_MODE_ICONS[mode],
        }))}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}
