// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockSetStringAsync = vi.fn<(value: string) => Promise<boolean>>(async () => true);
const mockEnqueueToast = vi.fn();
const { mockRouterBack } = vi.hoisted(() => ({
  mockRouterBack: vi.fn(),
}));

vi.mock('expo-clipboard', () => ({
  setStringAsync: (value: string) => mockSetStringAsync(value),
}));

vi.mock('@/store/toast-store', () => ({
  useToastStore: (selector: (state: { enqueueToast: typeof mockEnqueueToast }) => unknown) =>
    selector({ enqueueToast: mockEnqueueToast }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { id?: string }) => (params?.id ? `${key}:${params.id}` : key),
  }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      penBlue: '#00f',
      destructiveAction: '#f00',
      backgroundPrimary: '#fff',
      textPrimary: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      borderTertiary: '#eee',
    },
  }),
}));

vi.mock('@/hooks/useThemedStyles', () => ({
  useThemedStyles: (factory: (colors: Record<string, string>) => object) =>
    factory({
      penBlue: '#00f',
      destructiveAction: '#f00',
      backgroundPrimary: '#fff',
      textPrimary: '#000',
      textSecondary: '#666',
      textTertiary: '#999',
      borderTertiary: '#eee',
    }),
}));

const mockHistory = [
  {
    roomId: 'TEST',
    timestamp: 1724170000000,
    downTotal: 1024,
    upTotal: 512,
    buckets: [{ tSec: 1724170000, downBytes: 1024, upBytes: 512 }],
    actions: [
      { timestamp: 1724170000500, action: 'test-action', details: 'test-details', observed: false },
    ],
  },
];

const mockClearHistory = vi.fn();
let mockDeveloperModeEnabled = true;
let mockIsHydrated = true;

vi.mock('@/store/rtdb-diagnostics-store', () => {
  const useRtdbDiagnosticsStore = (
    selector: (state: {
      history: typeof mockHistory;
      clearHistory: () => void;
      developerModeEnabled: boolean;
      isHydrated: boolean;
    }) => unknown,
  ) => {
    const state = {
      history: mockHistory,
      clearHistory: mockClearHistory,
      get developerModeEnabled() {
        return mockDeveloperModeEnabled;
      },
      get isHydrated() {
        return mockIsHydrated;
      },
    };
    return selector(state);
  };
  return {
    useRtdbDiagnosticsStore: Object.assign(useRtdbDiagnosticsStore, {
      subscribe: vi.fn(() => vi.fn()),
      getState: vi.fn(() => ({
        history: mockHistory,
        clearHistory: mockClearHistory,
        get developerModeEnabled() {
          return mockDeveloperModeEnabled;
        },
        rtdbDiagnosticsEnabled: true,
        get isHydrated() {
          return mockIsHydrated;
        },
      })),
    }),
  };
});

vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => <div data-testid="redirect" data-href={href} />,
  Stack: {
    Screen: ({ options }: { options?: { headerBackAction?: () => void } }) => (
      <button type="button" data-testid="header-back" onClick={() => options?.headerBackAction?.()}>
        header-back
      </button>
    ),
  },
  useRouter: () => ({ back: mockRouterBack }),
}));

vi.mock('@/hooks/useSyncedStackBack', () => ({
  useSyncedStackBack: (handler: () => void) => handler,
}));

vi.mock('@/components/Screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/FeedbackPressable', () => ({
  FeedbackPressable: ({
    children,
    onPress,
  }: {
    children: React.ReactNode;
    onPress: () => void;
  }) => (
    <div onClick={onPress} role="button">
      {children}
    </div>
  ),
}));

import RtdbDiagnosticsScreen from '../app/settings/rtdb-diagnostics.js';

describe('RtdbDiagnosticsScreen', () => {
  beforeEach(() => {
    mockDeveloperModeEnabled = true;
    mockIsHydrated = true;
    mockClearHistory.mockClear();
    mockSetStringAsync.mockClear();
    mockEnqueueToast.mockClear();
    mockRouterBack.mockClear();
  });

  it('renders history list', () => {
    render(<RtdbDiagnosticsScreen />);
    expect(screen.getByText('rtdbDiagnostics.roomLabel:TEST')).toBeTruthy();
  });

  it('opens details when an entry is pressed', () => {
    render(<RtdbDiagnosticsScreen />);
    const item = screen.getByText('rtdbDiagnostics.roomLabel:TEST');
    fireEvent.click(item);

    expect(screen.getByText('test-action')).toBeTruthy();
    expect(screen.getByText('test-details')).toBeTruthy();
  });

  it('header back from details returns to the history list without leaving the screen', () => {
    render(<RtdbDiagnosticsScreen />);
    fireEvent.click(screen.getByText('rtdbDiagnostics.roomLabel:TEST'));
    expect(screen.getByText('test-action')).toBeTruthy();
    expect(screen.queryByText('common.back')).toBeNull();

    fireEvent.click(screen.getByTestId('header-back'));

    expect(screen.queryByText('test-action')).toBeNull();
    expect(screen.getByText('rtdbDiagnostics.details')).toBeTruthy();
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it('header back from the list pops to the previous screen', () => {
    render(<RtdbDiagnosticsScreen />);
    fireEvent.click(screen.getByTestId('header-back'));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('copies CSV for the selected room and shows a toast', async () => {
    render(<RtdbDiagnosticsScreen />);
    fireEvent.click(screen.getByText('rtdbDiagnostics.roomLabel:TEST'));
    fireEvent.click(screen.getByText('rtdbDiagnostics.copyCsv'));

    await waitFor(() => {
      expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
    });
    const csv = mockSetStringAsync.mock.calls[0][0];
    expect(csv).toContain(
      'iso_time,type,down_bytes,up_bytes,wire_rx_bytes,wire_tx_bytes,action,details,observed,room_id',
    );
    expect(csv).toContain('test-action');
    expect(csv).toContain(',1024,512,');
    expect(csv).toContain('TEST');
    expect(mockEnqueueToast).toHaveBeenCalledWith('rtdbDiagnostics.copyCsvDone', 'success');
  });

  it('calls clearHistory when clear button is pressed', () => {
    render(<RtdbDiagnosticsScreen />);
    const clearBtn = screen.getByText('rtdbDiagnostics.clearHistory');
    fireEvent.click(clearBtn);
    expect(mockClearHistory).toHaveBeenCalled();
  });

  it('redirects to settings when developer mode is off', () => {
    mockDeveloperModeEnabled = false;
    render(<RtdbDiagnosticsScreen />);
    expect(screen.getByTestId('redirect').getAttribute('data-href')).toBe('/settings');
  });

  it('renders nothing until hydrated', () => {
    mockIsHydrated = false;
    const { container } = render(<RtdbDiagnosticsScreen />);
    expect(container.firstChild).toBeNull();
  });
});
