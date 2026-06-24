import { StyleSheet, Text, ViewStyle } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** When false, skips haptic/sound (e.g. destructive confirm flows). Default true. */
  feedback?: boolean;
  style?: ViewStyle;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
      color: colors.textOnAccent,
      fontSize: 16,
      fontWeight: '600',
    },
    labelSecondary: {
      color: colors.textPrimary,
    },
  });
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
  const styles = useThemedStyles(createStyles);

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
