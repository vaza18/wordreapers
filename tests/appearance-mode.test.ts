import { describe, expect, it } from 'vitest';

import {
  DEFAULT_APPEARANCE_MODE,
  parseAppearanceMode,
  resolveColorScheme,
} from '@/lib/settings/appearance-mode';

describe('parseAppearanceMode', () => {
  it('returns valid modes unchanged', () => {
    expect(parseAppearanceMode('auto')).toBe('auto');
    expect(parseAppearanceMode('light')).toBe('light');
    expect(parseAppearanceMode('dark')).toBe('dark');
  });

  it('falls back to default for invalid or missing values', () => {
    expect(parseAppearanceMode(null)).toBe(DEFAULT_APPEARANCE_MODE);
    expect(parseAppearanceMode(undefined)).toBe(DEFAULT_APPEARANCE_MODE);
    expect(parseAppearanceMode('')).toBe(DEFAULT_APPEARANCE_MODE);
    expect(parseAppearanceMode('system')).toBe(DEFAULT_APPEARANCE_MODE);
  });
});

describe('resolveColorScheme', () => {
  it('forces light or dark when not auto', () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
  });

  it('follows OS scheme in auto mode', () => {
    expect(resolveColorScheme('auto', 'dark')).toBe('dark');
    expect(resolveColorScheme('auto', 'light')).toBe('light');
    expect(resolveColorScheme('auto', null)).toBe('light');
  });
});
