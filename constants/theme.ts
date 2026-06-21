/** Design tokens from docs/wordreapers_screens.html */
export const colors = {
  backgroundPrimary: '#FFFFFF',
  backgroundSecondary: '#F5F3ED',
  borderSecondary: '#D1D1D1',
  borderTertiary: '#E8E8E8',
  textPrimary: '#1A1A1A',
  textSecondary: '#666666',
  textTertiary: '#6B6B6B',
  accent: '#1D9E75',
  accentMuted: '#E8F5EF',
  alert: '#FF911C',
  danger: '#C0392B',
  dangerLight: '#E24B4A',
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
  notebookHole: '#2A2A2A',
  notebookHoleRing: '#888888',
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
