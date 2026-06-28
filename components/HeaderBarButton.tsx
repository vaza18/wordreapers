import type { ReactNode } from 'react';

import { FeedbackPressable } from '@/components/FeedbackPressable';
import { createHeaderIconButtonStyles } from '@/constants/header-button';
import { useHeaderIconButtonLayout } from '@/hooks/useHeaderIconButtonLayout';
import { useThemedStyles } from '@/hooks/useThemedStyles';

interface HeaderBarButtonProps {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}

/**
 * Rounded-square header icon button — scales with capped Dynamic Type.
 */
export function HeaderBarButton({
  accessibilityLabel,
  onPress,
  children,
  disabled = false,
}: HeaderBarButtonProps) {
  const styles = useThemedStyles(createHeaderIconButtonStyles);
  const { buttonSize } = useHeaderIconButtonLayout();

  return (
    <FeedbackPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.button,
        { width: buttonSize, height: buttonSize },
        disabled ? styles.disabled : null,
      ]}
    >
      {children}
    </FeedbackPressable>
  );
}
