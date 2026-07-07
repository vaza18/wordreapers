import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';

import { getThemeColors, radii, spacing } from '@/constants/theme';
import { ThemeContext, type ThemeContextValue } from '@/contexts/ThemeContext';

const lightTheme: ThemeContextValue = {
  colors: getThemeColors('light'),
  spacing,
  radii,
  appearanceMode: 'light',
  colorScheme: 'light',
  isDark: false,
};

/** Wrap UI with the light theme for component tests. */
function Providers({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={lightTheme}>{children}</ThemeContext.Provider>;
}

/** Render a component tree with the shared test theme provider. */
export function renderWithTheme(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Providers, ...options });
}

export { act, fireEvent, screen } from '@testing-library/react';
