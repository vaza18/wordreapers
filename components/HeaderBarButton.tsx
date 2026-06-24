import type { ReactNode } from 'react';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { createHeaderIconButtonStyles } from '@/constants/header-button';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface HeaderBarButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * Rounded-square header icon button — same chrome on home and stack screens.
 */
export function HeaderBarButton({
  accessibilityLabel,
  onPress,
  children,
  disabled = false,
}: HeaderBarButtonProps) {
  const styles = useThemedStyles(createHeaderIconButtonStyles);

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={[styles.button, disabled ? styles.disabled : null]}
    >
      {children}
    </FeedbackPressable>
  );
}
