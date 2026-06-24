import { createContext, ReactNode, useEffect, useMemo, useState } from 'react';

import {
  getThemeColors,
  radii,
  spacing,
  type ColorScheme,
  type ThemeColors,
} from '@/constants/theme';
import { resolveColorScheme, type AppearanceMode } from '@/lib/settings/appearance-mode';
import {
  readSystemColorScheme,
  subscribeSystemColorScheme,
  syncSystemAppearanceFollow,
} from '@/lib/system-color-scheme';
import { useSettingsStore } from '@/store/settings-store';

export interface ThemeContextValue {
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  appearanceMode: AppearanceMode;
  colorScheme: ColorScheme;
  isDark: boolean;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Supplies resolved theme colors based on appearance preference and OS scheme.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const appearanceMode = useSettingsStore((state) => state.appearanceMode);
  const [osScheme, setOsScheme] = useState(readSystemColorScheme);

  useEffect(() => {
    if (appearanceMode === 'auto') {
      syncSystemAppearanceFollow();
    }
    return subscribeSystemColorScheme(setOsScheme);
  }, [appearanceMode]);

  const colorScheme = resolveColorScheme(appearanceMode, osScheme);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: getThemeColors(colorScheme),
      spacing,
      radii,
      appearanceMode,
      colorScheme,
      isDark: colorScheme === 'dark',
    }),
    [appearanceMode, colorScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
