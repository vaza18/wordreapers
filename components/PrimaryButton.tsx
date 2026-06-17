import { StyleSheet, Text, ViewStyle } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, radii, spacing } from '@/constants/theme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** When false, skips haptic/sound (e.g. destructive confirm flows). Default true. */
  feedback?: boolean;
  style?: ViewStyle;
}

/**
 * Primary call-to-action button matching mockup styling.
 */
export function PrimaryButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  feedback = true,
  style,
}: PrimaryButtonProps) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      disabled={disabled}
      feedback={feedback}
      onPress={onPress}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.label, variant === 'secondary' ? styles.labelSecondary : null]}>
        {label}
      </Text>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: colors.borderSecondary,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  labelSecondary: {
    color: colors.textPrimary,
  },
});
