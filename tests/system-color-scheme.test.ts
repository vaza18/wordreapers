import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSystemColorScheme, syncSystemAppearanceFollow } from '@/lib/system-color-scheme';

const appearanceState = vi.hoisted(() => ({
  scheme: 'light' as 'light' | 'dark' | null,
}));

vi.mock('react-native', () => ({
  Appearance: {
    getColorScheme: () => appearanceState.scheme,
    setColorScheme: vi.fn((scheme: 'light' | 'dark' | 'unspecified' | null) => {
      appearanceState.scheme = scheme === 'unspecified' ? null : scheme;
    }),
    addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
  },
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

describe('readSystemColorScheme', () => {
  beforeEach(() => {
    appearanceState.scheme = 'light';
  });

  it('returns light or dark when available', () => {
    expect(readSystemColorScheme()).toBe('light');
    appearanceState.scheme = 'dark';
    expect(readSystemColorScheme()).toBe('dark');
  });

  it('returns null for unknown values', () => {
    appearanceState.scheme = null;
    expect(readSystemColorScheme()).toBeNull();
  });
});

describe('syncSystemAppearanceFollow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears forced scheme so OS preference applies', async () => {
    const { Appearance } = await import('react-native');
    syncSystemAppearanceFollow();
    expect(Appearance.setColorScheme).toHaveBeenCalledWith('unspecified');
  });
});
