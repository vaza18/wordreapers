// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const markPlayerOnline = vi.fn();
const subscribePlayerOnlinePresence = vi.fn();
const voluntaryLeaveWaitingLobbyIfMember = vi.fn();
const consumePresenceHandoff = vi.fn();
const appStateHandlers: Array<(state: string) => void> = [];

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_event: string, handler: (state: string) => void) => {
      appStateHandlers.push(handler);
      return { remove: () => {} };
    },
  },
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  markPlayerOnline: (...args: unknown[]) => markPlayerOnline(...args),
  subscribePlayerOnlinePresence: (...args: unknown[]) => subscribePlayerOnlinePresence(...args),
  voluntaryLeaveWaitingLobbyIfMember: (...args: unknown[]) =>
    voluntaryLeaveWaitingLobbyIfMember(...args),
}));

vi.mock('../lib/online/presence-handoff.js', () => ({
  consumePresenceHandoff: (...args: unknown[]) => consumePresenceHandoff(...args),
}));

import { usePlayerOnlinePresence } from '../lib/online/use-player-online-presence.js';

function HookHost(props: { gameId?: string; uid?: string; enabled?: boolean }) {
  usePlayerOnlinePresence(props.gameId, props.uid, props.enabled ?? true);
  return null;
}

describe('usePlayerOnlinePresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appStateHandlers.length = 0;
    markPlayerOnline.mockResolvedValue(undefined);
    subscribePlayerOnlinePresence.mockReturnValue(vi.fn());
    voluntaryLeaveWaitingLobbyIfMember.mockResolvedValue(undefined);
    consumePresenceHandoff.mockReturnValue(false);
  });

  it('marks player online on mount and reconnects on foreground', () => {
    render(<HookHost gameId="ABCD" uid="org" />);

    expect(markPlayerOnline).toHaveBeenCalledWith('ABCD', 'org');
    expect(subscribePlayerOnlinePresence).toHaveBeenCalledWith('ABCD', 'org');

    appStateHandlers[0]?.('active');
    expect(markPlayerOnline).toHaveBeenCalledTimes(2);
  });

  it('voluntarily leaves waiting lobby on unmount without handoff', () => {
    const { unmount } = render(<HookHost gameId="ABCD" uid="org" />);
    unmount();

    expect(voluntaryLeaveWaitingLobbyIfMember).toHaveBeenCalledWith('ABCD', 'org');
  });

  it('skips voluntary leave when presence handoff is active', () => {
    consumePresenceHandoff.mockReturnValue(true);
    const { unmount } = render(<HookHost gameId="ABCD" uid="org" />);
    unmount();

    expect(voluntaryLeaveWaitingLobbyIfMember).not.toHaveBeenCalled();
  });
});
