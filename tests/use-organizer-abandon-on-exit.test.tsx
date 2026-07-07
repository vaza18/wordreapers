// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const organizerLeaveWaitingLobby = vi.fn();
const setOrganizerWaitingRoom = vi.fn();
const beforeRemoveHandlers: Array<(event: { data?: { action?: { type?: string } } }) => void> = [];
const addListener = vi.fn((event: string, handler: (typeof beforeRemoveHandlers)[number]) => {
  if (event === 'beforeRemove') {
    beforeRemoveHandlers.push(handler);
  }
  return () => {
    const index = beforeRemoveHandlers.indexOf(handler);
    if (index >= 0) {
      beforeRemoveHandlers.splice(index, 1);
    }
  };
});

vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener,
    getState: () => ({
      routes: [{ name: 'online/lobby/[gameId]', params: { gameId: 'ABCD' } }],
      index: 0,
    }),
  }),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  organizerLeaveWaitingLobby: (...args: unknown[]) => organizerLeaveWaitingLobby(...args),
}));

vi.mock('../lib/online/organizer-waiting-room.js', () => ({
  setOrganizerWaitingRoom: (...args: unknown[]) => setOrganizerWaitingRoom(...args),
}));

import { useOrganizerAbandonWaitingOnExit } from '../lib/online/use-organizer-abandon-on-exit.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

/** Minimal host for hook tests. */
function HookHost(props: {
  gameId: string;
  organizerUid: string | null;
  session: Parameters<typeof useOrganizerAbandonWaitingOnExit>[2];
  sessionStatus: Parameters<typeof useOrganizerAbandonWaitingOnExit>[3];
  enabled: boolean;
}) {
  useOrganizerAbandonWaitingOnExit(
    props.gameId,
    props.organizerUid,
    props.session,
    props.sessionStatus,
    props.enabled,
  );
  return null;
}

const waitingSession = {
  baseWord: 'тест',
  status: 'waiting' as const,
  settings: DEFAULT_SESSION_SETTINGS,
  timerEndsAt: null,
  organizerId: 'org-1',
  players: {
    'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
  },
};

describe('useOrganizerAbandonWaitingOnExit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beforeRemoveHandlers.length = 0;
    organizerLeaveWaitingLobby.mockResolvedValue(undefined);
  });

  it('tracks the waiting room and cleans up on back navigation', async () => {
    render(
      <HookHost
        gameId="ABCD"
        organizerUid="org-1"
        session={waitingSession}
        sessionStatus="waiting"
        enabled
      />,
    );

    expect(setOrganizerWaitingRoom).toHaveBeenCalledWith('ABCD');
    expect(beforeRemoveHandlers).toHaveLength(1);

    beforeRemoveHandlers[0]?.({ data: { action: { type: 'GO_BACK' } } });

    await vi.waitFor(() => {
      expect(organizerLeaveWaitingLobby).toHaveBeenCalledWith('ABCD', 'org-1', waitingSession);
    });
    expect(setOrganizerWaitingRoom).toHaveBeenCalledWith(null);
  });

  it('ignores non-back navigation actions', () => {
    render(
      <HookHost
        gameId="ABCD"
        organizerUid="org-1"
        session={waitingSession}
        sessionStatus="waiting"
        enabled
      />,
    );

    beforeRemoveHandlers[0]?.({ data: { action: { type: 'NAVIGATE' } } });

    expect(organizerLeaveWaitingLobby).not.toHaveBeenCalled();
  });
});
