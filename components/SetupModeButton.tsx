import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { colors, radii, spacing } from '@/constants/theme';

interface SetupModeButtonProps {
  icon: ReactNode;
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Equal-weight setup mode choice — icon, label, and short player-count hint.
 */
export function SetupModeButton({
  icon,
  label,
  hint,
  onPress,
  disabled = false,
  style,
}: SetupModeButtonProps) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.base, disabled ? styles.disabled : null, style]}
    >
      <View style={styles.iconSlot}>{icon}</View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.accent,
    minHeight: 108,
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  hint: {
    color: '#D8F3EA',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
});
