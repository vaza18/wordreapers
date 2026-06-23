/** App appearance preference (Auto follows OS color scheme). */
export type AppearanceMode = 'auto' | 'light' | 'dark';

export const APPEARANCE_MODES: readonly AppearanceMode[] = ['auto', 'light', 'dark'] as const;

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = 'auto';

export const APPEARANCE_MODE_STORAGE_KEY = 'wordreapers.appearanceMode';

/**
 * Parse persisted appearance mode; falls back to default when invalid.
 */
export function parseAppearanceMode(value: string | null | undefined): AppearanceMode {
  if (value && APPEARANCE_MODES.includes(value as AppearanceMode)) {
    return value as AppearanceMode;
  }
  return DEFAULT_APPEARANCE_MODE;
}

/**
 * Resolve effective light/dark scheme from user preference and OS scheme.
 */
export function resolveColorScheme(
  appearanceMode: AppearanceMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): 'light' | 'dark' {
  if (appearanceMode === 'light') {
    return 'light';
  }
  if (appearanceMode === 'dark') {
    return 'dark';
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}
