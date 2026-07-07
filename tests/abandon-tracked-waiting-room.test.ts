import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const abandonWaitingGameSession = vi.fn();
const organizerLeaveWaitingLobby = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/game-session-service.js', () => ({
  abandonWaitingGameSession: (...args: unknown[]) => abandonWaitingGameSession(...args),
  organizerLeaveWaitingLobby: (...args: unknown[]) => organizerLeaveWaitingLobby(...args),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

vi.mock('../lib/online/local-room-draft.js', () => ({
  getLocalRoomDraft: vi.fn(),
}));

import { getLocalRoomDraft } from '../lib/online/local-room-draft.js';
import {
  abandonOrganizerWaitingRoomForDraft,
  abandonTrackedOrganizerWaitingRoom,
} from '../lib/online/abandon-tracked-waiting-room.js';
import {
  getOrganizerWaitingRoom,
  setOrganizerWaitingRoom,
} from '../lib/online/organizer-waiting-room.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

function waitingSnapshot(
  players: Record<
    string,
    { name: string; wordCount: number; score: number; online: boolean; hasLeft?: boolean }
  >,
) {
  return {
    exists: () => true,
    val: () => ({
      baseWord: 'тест',
      status: 'waiting',
      timerEndsAt: null,
      organizerId: 'org-1',
      settings: DEFAULT_SESSION_SETTINGS,
      players,
    }),
  };
}

describe('abandon-tracked-waiting-room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOrganizerWaitingRoom(null);
    abandonWaitingGameSession.mockResolvedValue(undefined);
    organizerLeaveWaitingLobby.mockResolvedValue(undefined);
    ensureAnonymousAuth.mockResolvedValue({ uid: 'org-1' });
    getMock.mockResolvedValue(
      waitingSnapshot({
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
      }),
    );
  });

  it('abandons the tracked waiting room when organizer is alone', async () => {
    setOrganizerWaitingRoom('ABCDE');

    await abandonTrackedOrganizerWaitingRoom('org-1');

    expect(getOrganizerWaitingRoom()).toBeNull();
    expect(abandonWaitingGameSession).toHaveBeenCalledWith('ABCDE', 'org-1');
  });

  it('leaves the lobby instead of deleting when another player is online', async () => {
    setOrganizerWaitingRoom('ABCDE');
    getMock.mockResolvedValueOnce(
      waitingSnapshot({
        'org-1': { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
      }),
    );

    await abandonTrackedOrganizerWaitingRoom('org-1');

    expect(organizerLeaveWaitingLobby).toHaveBeenCalled();
    expect(abandonWaitingGameSession).not.toHaveBeenCalled();
  });

  it('abandons published draft rooms when organizer leaves for solo training', async () => {
    setOrganizerWaitingRoom('TRACKED');
    vi.mocked(getLocalRoomDraft).mockReturnValue({
      draftId: 'DRAFT1',
      preferredCode: 'DRAFT1',
      profile: { name: 'Org', avatarColorIndex: 0, gender: 'm' },
      setup: null,
      publishedGameId: 'PUBLISHED',
    });

    await abandonOrganizerWaitingRoomForDraft('DRAFT1');

    expect(abandonWaitingGameSession).toHaveBeenCalledTimes(2);
    expect(abandonWaitingGameSession).toHaveBeenCalledWith('TRACKED', 'org-1');
    expect(abandonWaitingGameSession).toHaveBeenCalledWith('PUBLISHED', 'org-1');
    expect(getOrganizerWaitingRoom()).toBeNull();
  });
});
