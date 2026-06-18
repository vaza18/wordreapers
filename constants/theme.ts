/** Design tokens from docs/wordreapers_screens.html */
export const colors = {
  backgroundPrimary: '#FFFFFF',
  backgroundSecondary: '#F5F3ED',
  borderSecondary: '#D1D1D1',
  borderTertiary: '#E8E8E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#999999',
  accent: '#1D9E75',
  accentMuted: '#E8F5EF',
  danger: '#C0392B',
  /** Ballpoint / word list ink (mockup screen 5) */
  penBlue: '#378ADD',
  penBlueMuted: '#E6F1FB',
  prefixHighlightBg: '#E1F5EE',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 24,
} as const;
