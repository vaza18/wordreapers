import type { ReactNode } from 'react';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { headerIconButtonStyles } from '@/constants/header-button';

interface HeaderBarButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}

/**
 * Rounded-square header icon button — same chrome on home and stack screens.
 */
export function HeaderBarButton({ accessibilityLabel, onPress, children }: HeaderBarButtonProps) {
  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={headerIconButtonStyles.button}
    >
      {children}
    </FeedbackPressable>
  );
}
