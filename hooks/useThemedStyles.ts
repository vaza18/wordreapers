import { useMemo } from 'react';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/**
 * Build StyleSheet styles from the active theme colors.
 * Pass a stable factory defined outside the component.
 */
export function useThemedStyles<T extends Record<string, unknown>>(
  factory: (colors: ThemeColors) => T,
): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
