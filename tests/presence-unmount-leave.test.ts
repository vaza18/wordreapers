import { describe, expect, it } from 'vitest';

import { shouldLeaveWaitingLobbyOnPresenceUnmount } from '../lib/online/presence/presence-unmount-leave.js';

describe('shouldLeaveWaitingLobbyOnPresenceUnmount', () => {
  it('leaves initial waiting lobby for non-organizer', () => {
    expect(
      shouldLeaveWaitingLobbyOnPresenceUnmount(
        {
          status: 'waiting',
          organizerId: 'org',
          baseWordRound: 0,
        },
        'guest',
      ),
    ).toBe(true);
  });

  it('does not leave rematch waiting (peer may have rematched during time-up)', () => {
    expect(
      shouldLeaveWaitingLobbyOnPresenceUnmount(
        {
          status: 'waiting',
          organizerId: 'org',
          baseWordRound: 2,
        },
        'guest',
      ),
    ).toBe(false);
  });

  it('does not leave when durable rematch latch is set', () => {
    expect(
      shouldLeaveWaitingLobbyOnPresenceUnmount(
        {
          status: 'waiting',
          organizerId: 'org',
          baseWordRound: 0,
          resultsExitedBy: { guest: true },
        },
        'guest',
      ),
    ).toBe(false);
  });

  it('does not leave for organizer', () => {
    expect(
      shouldLeaveWaitingLobbyOnPresenceUnmount(
        {
          status: 'waiting',
          organizerId: 'org',
          baseWordRound: 0,
        },
        'org',
      ),
    ).toBe(false);
  });
});
