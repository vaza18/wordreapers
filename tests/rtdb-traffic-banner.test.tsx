// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

import { RtdbTrafficBanner } from '@/components/debug/RtdbTrafficBanner';
import { useRtdbDiagnosticsStore, type RtdbDiagnosticsState } from '@/store/rtdb-diagnostics-store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ colors: {} }),
}));

vi.mock('@/hooks/useThemedStyles', () => ({
  useThemedStyles: (fn: (colors: Record<string, string>) => object) => fn({}),
}));

vi.mock('@/lib/debug/rtdb-traffic-probe', () => ({
  rtdbTrafficProbe: {
    getLiveBuckets: () => [],
    getRecentActions: () => [],
    getRoomTotals: () => ({ down: 0, up: 0 }),
    subscribe: () => () => {},
    isCollecting: () => false,
  },
}));

vi.mock('react-native-svg', () => ({
  default: (props: Record<string, unknown>) => <div {...props} />,
  Svg: (props: Record<string, unknown>) => <div {...props} />,
  Path: (props: Record<string, unknown>) => <div {...props} />,
}));

vi.mock('@/store/rtdb-diagnostics-store');

describe('RtdbTrafficBanner', () => {
  it('returns null when developerModeEnabled is false', () => {
    vi.mocked(useRtdbDiagnosticsStore).mockImplementation((selector) =>
      selector({
        developerModeEnabled: false,
        rtdbDiagnosticsEnabled: true,
        isHydrated: true,
      } as unknown as RtdbDiagnosticsState),
    );

    const { container } = render(<RtdbTrafficBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when all flags are true', () => {
    vi.mocked(useRtdbDiagnosticsStore).mockImplementation((selector) =>
      selector({
        developerModeEnabled: true,
        rtdbDiagnosticsEnabled: true,
        isHydrated: true,
      } as unknown as RtdbDiagnosticsState),
    );

    render(<RtdbTrafficBanner />);
    expect(screen.getByText('↓')).toBeTruthy();
    expect(screen.getByText('↑')).toBeTruthy();
  });
});
