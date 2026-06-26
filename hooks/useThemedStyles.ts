import { useMemo } from 'react';

import type { ThemeColors } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/**
 * Build StyleSheet styles from the active theme colors.
 * Text fontSize is scaled natively (Dynamic Type); layout sizes stay fixed unless a
 * component opts into content-driven sizing (e.g. notebook row minHeight).
 */
export function useThemedStyles<T extends Record<string, unknown>>(
  factory: (colors: ThemeColors) => T,
): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
