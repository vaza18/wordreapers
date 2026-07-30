// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const markPlayerOnline = vi.fn();
const markPlayerOffline = vi.fn();
const subscribePlayerOnlinePresence = vi.fn();
const consumePresenceHandoff = vi.fn();
const appStateHandlers: Array<(state: string) => void> = [];
let currentAppState = 'active';

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return currentAppState;
    },
    addEventListener: (_event: string, handler: (state: string) => void) => {
      appStateHandlers.push(handler);
      return { remove: () => {} };
    },
  },
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  markPlayerOnline: (...args: unknown[]) => markPlayerOnline(...args),
  markPlayerOffline: (...args: unknown[]) => markPlayerOffline(...args),
  subscribePlayerOnlinePresence: (...args: unknown[]) => subscribePlayerOnlinePresence(...args),
}));

vi.mock('../lib/online/presence/presence-handoff.js', () => ({
  consumePresenceHandoff: (...args: unknown[]) => consumePresenceHandoff(...args),
}));

import { usePlayerOnlinePresence } from '../lib/online/presence/use-player-online-presence.js';

function HookHost(props: { gameId?: string; uid?: string; enabled?: boolean }) {
  usePlayerOnlinePresence(props.gameId, props.uid, props.enabled ?? true);
  return null;
}

describe('usePlayerOnlinePresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appStateHandlers.length = 0;
    currentAppState = 'active';
    markPlayerOnline.mockResolvedValue(undefined);
    markPlayerOffline.mockResolvedValue(undefined);
    subscribePlayerOnlinePresence.mockReturnValue(vi.fn());
    consumePresenceHandoff.mockReturnValue(false);
  });

  it('marks player online on mount and reconnects on foreground', () => {
    render(<HookHost gameId="ABCD" uid="org" />);

    expect(markPlayerOnline).toHaveBeenCalledWith('ABCD', 'org');
    expect(subscribePlayerOnlinePresence).toHaveBeenCalledWith('ABCD', 'org');

    appStateHandlers[0]?.('active');
    expect(markPlayerOnline).toHaveBeenCalledTimes(2);
  });

  it('marks player offline on background', () => {
    render(<HookHost gameId="ABCD" uid="org" />);
    appStateHandlers[0]?.('background');
    expect(markPlayerOffline).toHaveBeenCalledWith('ABCD', 'org');
  });

  it('marks player offline on inactive (iOS lock screen) with default play policy', () => {
    render(<HookHost gameId="ABCD" uid="org" />);
    appStateHandlers[0]?.('inactive');
    expect(markPlayerOffline).toHaveBeenCalledWith('ABCD', 'org');
  });

  it('does not mark offline on inactive when lobby uses background-only policy', () => {
    function LobbyHost() {
      usePlayerOnlinePresence('ABCD', 'org', true, 'background-only');
      return null;
    }
    render(<LobbyHost />);
    appStateHandlers[0]?.('inactive');
    expect(markPlayerOffline).not.toHaveBeenCalled();
    appStateHandlers[0]?.('background');
    expect(markPlayerOffline).toHaveBeenCalledWith('ABCD', 'org');
  });

  it('policy remount does not write offline on cleanup (CM2L7 flicker)', () => {
    function PolicyHost({ policy }: { policy: 'background-only' | 'background-and-inactive' }) {
      usePlayerOnlinePresence('ABCD', 'org', true, policy);
      return null;
    }
    const { rerender, unmount } = render(<PolicyHost policy="background-only" />);
    markPlayerOffline.mockClear();
    // waiting→playing style remount: cleanup must not flash peers offline.
    rerender(<PolicyHost policy="background-and-inactive" />);
    expect(markPlayerOffline).not.toHaveBeenCalled();
    expect(consumePresenceHandoff).toHaveBeenCalledWith('ABCD');
    unmount();
    expect(markPlayerOffline).not.toHaveBeenCalled();
  });

  it('does not mark offline on unmount without handoff', () => {
    const { unmount } = render(<HookHost gameId="ABCD" uid="org" />);
    markPlayerOffline.mockClear();
    unmount();

    expect(markPlayerOffline).not.toHaveBeenCalled();
    expect(consumePresenceHandoff).toHaveBeenCalledWith('ABCD');
  });

  it('still consumes handoff token on unmount when handoff is active', () => {
    consumePresenceHandoff.mockReturnValue(true);
    const { unmount } = render(<HookHost gameId="ABCD" uid="org" />);
    markPlayerOffline.mockClear();
    unmount();

    expect(markPlayerOffline).not.toHaveBeenCalled();
    expect(consumePresenceHandoff).toHaveBeenCalledWith('ABCD');
  });
});
