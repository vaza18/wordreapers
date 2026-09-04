// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnqueueToast = vi.fn();
const mockSetDeveloperModeEnabled = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/useThemedStyles', () => ({
  useThemedStyles: (factory: (colors: Record<string, string>) => object) =>
    factory({
      textTertiary: '#666',
    }),
}));

vi.mock('@/lib/app-version', () => ({
  getAppVersionInfo: () => ({ version: '1.0.0', build: '1' }),
  shouldShowBuildNumber: () => true,
}));

let mockDeveloperModeEnabled = false;

vi.mock('@/store/rtdb-diagnostics-store', () => {
  const useRtdbDiagnosticsStore = vi.fn(
    (
      selector: (state: {
        developerModeEnabled: boolean;
        setDeveloperModeEnabled: (v: boolean) => void;
      }) => unknown,
    ) => {
      const state = {
        developerModeEnabled: mockDeveloperModeEnabled,
        setDeveloperModeEnabled: mockSetDeveloperModeEnabled,
      };
      return selector(state);
    },
  );
  return {
    useRtdbDiagnosticsStore: Object.assign(useRtdbDiagnosticsStore, {
      subscribe: vi.fn(() => vi.fn()),
      getState: vi.fn(() => ({
        developerModeEnabled: mockDeveloperModeEnabled,
        rtdbDiagnosticsEnabled: false,
      })),
    }),
  };
});

vi.mock('@/store/toast-store', () => ({
  useToastStore: (
    selector: (state: { enqueueToast: (msg: string, type: string) => void }) => unknown,
  ) => {
    const state = {
      enqueueToast: mockEnqueueToast,
    };
    return selector(state);
  },
}));

import { AppVersionLabel } from '../components/AppVersionLabel.js';

describe('AppVersionLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockDeveloperModeEnabled = false;
  });

  it('toggles developer mode after 7 quick taps', () => {
    render(<AppVersionLabel />);
    const pressable = screen.getByText('app.versionWithBuild');

    // 6 taps
    for (let i = 0; i < 6; i++) {
      fireEvent.click(pressable);
      vi.advanceTimersByTime(100);
    }
    expect(mockSetDeveloperModeEnabled).not.toHaveBeenCalled();

    // 7th tap
    fireEvent.click(pressable);
    expect(mockSetDeveloperModeEnabled).toHaveBeenCalledWith(true);
    expect(mockEnqueueToast).toHaveBeenCalledWith('settings.developerMode.enabled', 'success');
  });

  it('resets tap count if delay is too long', () => {
    render(<AppVersionLabel />);
    const pressable = screen.getByText('app.versionWithBuild');

    // 3 taps
    for (let i = 0; i < 3; i++) {
      fireEvent.click(pressable);
      vi.advanceTimersByTime(100);
    }

    // Wait 600ms
    vi.advanceTimersByTime(600);

    // 4 more taps (total 7, but 3 were reset)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(pressable);
      vi.advanceTimersByTime(100);
    }
    expect(mockSetDeveloperModeEnabled).not.toHaveBeenCalled();
  });

  it('disables developer mode if already enabled', () => {
    mockDeveloperModeEnabled = true;

    render(<AppVersionLabel />);
    const pressable = screen.getByText('app.versionWithBuild');

    for (let i = 0; i < 7; i++) {
      fireEvent.click(pressable);
      vi.advanceTimersByTime(100);
    }
    expect(mockSetDeveloperModeEnabled).toHaveBeenCalledWith(false);
    expect(mockEnqueueToast).toHaveBeenCalledWith('settings.developerMode.disabled', 'default');
  });
});
