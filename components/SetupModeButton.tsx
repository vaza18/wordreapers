import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { radii, spacing, type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface SetupModeButtonProps {
  icon: ReactNode;
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  disabledHint?: string;
  onDisabledPress?: () => void;
  variant?: 'primary' | 'secondary';
  style?: StyleProp<ViewStyle>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    base: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      borderRadius: radii.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      minHeight: 108,
    },
    primary: {
      backgroundColor: colors.accent,
    },
    secondary: {
      backgroundColor: colors.backgroundPrimary,
      borderWidth: 1,
      borderColor: colors.borderSecondary,
      alignSelf: 'center',
      minHeight: 92,
      paddingVertical: spacing.sm,
    },
    disabled: {
      opacity: 0.5,
    },
    iconSlot: {
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: colors.textOnAccent,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
      lineHeight: 18,
    },
    labelSecondary: {
      color: colors.textPrimary,
    },
    hint: {
      color: '#D8F3EA',
      fontSize: 12,
      fontWeight: '500',
      textAlign: 'center',
    },
    hintSecondary: {
      color: colors.textSecondary,
    },
  });
}

/**
 * Setup mode choice — icon, label, and short player-count hint.
 */
export function SetupModeButton({
  icon,
  label,
  hint,
  onPress,
  disabled = false,
  disabledHint,
  onDisabledPress,
  variant = 'primary',
  style,
}: SetupModeButtonProps) {
  const styles = useThemedStyles(createStyles);
  const isSecondary = variant === 'secondary';
  const showDisabledPress = disabled && onDisabledPress != null;

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={disabled ? disabledHint : undefined}
      accessibilityState={{ disabled }}
      disabled={disabled && !showDisabledPress}
      onPress={showDisabledPress ? onDisabledPress : onPress}
      style={[
        styles.base,
        isSecondary ? styles.secondary : styles.primary,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <View style={styles.iconSlot}>{icon}</View>
      <Text style={[styles.label, isSecondary ? styles.labelSecondary : null]}>{label}</Text>
      <Text style={[styles.hint, isSecondary ? styles.hintSecondary : null]}>{hint}</Text>
    </FeedbackPressable>
  );
}
