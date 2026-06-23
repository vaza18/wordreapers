import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from '@/contexts/ThemeContext';

/** Active theme colors and appearance metadata. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
