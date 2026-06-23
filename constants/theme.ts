/** Design tokens from docs/wordreapers_screens.html */
export const lightColors = {
  backgroundPrimary: '#FFFFFF',
  backgroundSecondary: '#F5F3ED',
  borderSecondary: '#D1D1D1',
  borderTertiary: '#E8E8E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#6B6B6B',
  textOnAccent: '#FFFFFF',
  accent: '#1D9E75',
  accentMuted: '#E8F5EF',
  alert: '#FF911C',
  danger: '#C0392B',
  dangerLight: '#E24B4A',
  destructiveAction: '#993C1D',
  /** Ballpoint / word list ink (mockup screen 5) */
  penBlue: '#378ADD',
  penBlueMuted: '#E6F1FB',
  prefixHighlightBg: '#E1F5EE',
  /** Switch track / thumb (contrast-safe on backgroundSecondary) */
  switchTrackOn: '#1D9E75',
  switchTrackOff: '#D1D1D1',
  switchThumbOn: '#FFFFFF',
  switchThumbOff: '#FFFFFF',
  /** Unfilled slider track and similar controls */
  controlTrack: '#D1D1D1',
  /** Notebook word-list panel */
  notebookPaper: '#FFFFFF',
  notebookLine: '#A8C4E0',
  notebookHole: '#F5F3ED',
  notebookHoleRing: '#888888',
  /** Warning / host badge chips */
  warningBg: '#FAEEDA',
  warningText: '#633806',
  shadow: '#000000',
} as const;

export const darkColors = {
  backgroundPrimary: '#1C1C1E',
  backgroundSecondary: '#121212',
  borderSecondary: '#3A3A3C',
  borderTertiary: '#2C2C2E',
  textPrimary: '#F5F5F5',
  textSecondary: '#A0A0A0',
  textTertiary: '#8E8E93',
  textOnAccent: '#FFFFFF',
  accent: '#1D9E75',
  accentMuted: '#1A3D32',
  alert: '#FF911C',
  danger: '#E24B4A',
  dangerLight: '#FF6B6A',
  destructiveAction: '#FF8A65',
  penBlue: '#5BA3E8',
  penBlueMuted: '#1A2F42',
  prefixHighlightBg: '#1A3D32',
  switchTrackOn: '#1D9E75',
  switchTrackOff: '#48484A',
  switchThumbOn: '#FFFFFF',
  switchThumbOff: '#FFFFFF',
  controlTrack: '#48484A',
  notebookPaper: '#2C2C2E',
  notebookLine: '#4A6A8A',
  notebookHole: '#121212',
  notebookHoleRing: '#636366',
  warningBg: '#3D3420',
  warningText: '#F5D78E',
  shadow: '#000000',
} as const;

export type ThemeColors = {
  readonly [K in keyof typeof lightColors]: string;
};
export type ColorScheme = 'light' | 'dark';

/** Resolve palette for the given color scheme. */
export function getThemeColors(scheme: ColorScheme): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}

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
