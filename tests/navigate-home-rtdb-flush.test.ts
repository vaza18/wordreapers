import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  router: {
    canDismiss: vi.fn(() => false),
    canGoBack: vi.fn(() => false),
    dismissTo: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  },
}));

import { router } from 'expo-router';
import { rtdbTrafficProbe } from '@/lib/debug/rtdb-traffic-probe';
import {
  navigateHomeClearingStack,
  navigateHomeWithBackAnimation,
} from '@/lib/navigation/navigate-home';
import { useRtdbDiagnosticsStore } from '@/store/rtdb-diagnostics-store';

describe('navigate-home RTDB diagnostics flush', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rtdbTrafficProbe.reset();
    useRtdbDiagnosticsStore.getState().reset();
    useRtdbDiagnosticsStore.setState({ developerModeEnabled: true, rtdbDiagnosticsEnabled: true });
    vi.mocked(router.canDismiss).mockReturnValue(false);
    vi.mocked(router.canGoBack).mockReturnValue(false);
  });

  it('navigateHomeClearingStack flushes sticky room history and clears the banner room', () => {
    rtdbTrafficProbe.setActiveRoomId('ROOM1');
    rtdbTrafficProbe.record('down', 12);

    navigateHomeClearingStack();

    expect(useRtdbDiagnosticsStore.getState().history).toHaveLength(1);
    expect(useRtdbDiagnosticsStore.getState().history[0]?.roomId).toBe('ROOM1');
    expect(rtdbTrafficProbe.getRoomTotals().roomId).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('navigateHomeWithBackAnimation flushes sticky room history', () => {
    rtdbTrafficProbe.setActiveRoomId('ROOM2');
    rtdbTrafficProbe.record('up', 7);

    navigateHomeWithBackAnimation();

    expect(useRtdbDiagnosticsStore.getState().history).toHaveLength(1);
    expect(rtdbTrafficProbe.getRoomTotals().roomId).toBeNull();
  });
});
