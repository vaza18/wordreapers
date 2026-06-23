import type { ReactNode } from 'react';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { createHeaderIconButtonStyles } from '@/constants/header-button';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface HeaderBarButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
}

/**
 * Rounded-square header icon button — same chrome on home and stack screens.
 */
export function HeaderBarButton({ accessibilityLabel, onPress, children }: HeaderBarButtonProps) {
  const styles = useThemedStyles(createHeaderIconButtonStyles);

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      onPress={onPress}
      style={styles.button}
    >
      {children}
    </FeedbackPressable>
  );
}
