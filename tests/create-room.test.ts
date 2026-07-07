import { beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();
const generateRoomCode = vi.fn(() => 'ABCDE');
const createLocalRoomDraft = vi.fn();
const ensureFirebaseReady = vi.fn();
const abandonTrackedOrganizerWaitingRoom = vi.fn();
const setConnection = vi.fn();

vi.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => routerPush(...args) },
}));

vi.mock('../lib/firebase/room-code.js', () => ({
  generateRoomCode: () => generateRoomCode(),
}));

vi.mock('../lib/online/local-room-draft.js', () => ({
  createLocalRoomDraft: (...args: unknown[]) => createLocalRoomDraft(...args),
}));

vi.mock('../lib/firebase/ensure-firebase-ready.js', () => ({
  ensureFirebaseReady: () => ensureFirebaseReady(),
}));

vi.mock('../lib/online/abandon-tracked-waiting-room.js', () => ({
  abandonTrackedOrganizerWaitingRoom: (...args: unknown[]) =>
    abandonTrackedOrganizerWaitingRoom(...args),
}));

vi.mock('../store/firebase-store.js', () => ({
  useFirebaseStore: {
    getState: () => ({ setConnection }),
  },
}));

import { navigateToLocalRoomSetup, navigateToNewOnlineRoom } from '../lib/online/create-room.js';

const profile = { name: 'Test', avatarColorIndex: 0, gender: 'm' as const };

describe('create-room', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLocalRoomDraft.mockReturnValue({ draftId: 'ABCDE' });
    ensureFirebaseReady.mockResolvedValue({
      status: 'ready',
      uid: 'uid-1',
      errorMessage: null,
    });
    abandonTrackedOrganizerWaitingRoom.mockResolvedValue(undefined);
  });

  it('opens local setup immediately with generated code', () => {
    navigateToLocalRoomSetup(profile);

    expect(generateRoomCode).toHaveBeenCalled();
    expect(createLocalRoomDraft).toHaveBeenCalledWith('ABCDE', profile);
    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/online/setup',
      params: { gameId: 'ABCDE' },
    });
  });

  it('bootstraps Firebase after opening local setup for new online room', async () => {
    navigateToNewOnlineRoom(profile);

    expect(routerPush).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(ensureFirebaseReady).toHaveBeenCalled();
    });
    expect(setConnection).toHaveBeenCalledWith({
      status: 'ready',
      uid: 'uid-1',
      errorMessage: null,
    });
    expect(abandonTrackedOrganizerWaitingRoom).toHaveBeenCalledWith('uid-1');
  });

  it('skips Firebase bootstrap when auth is unavailable', async () => {
    ensureFirebaseReady.mockResolvedValue(null);

    navigateToNewOnlineRoom(profile);

    await vi.waitFor(() => {
      expect(ensureFirebaseReady).toHaveBeenCalled();
    });
    expect(setConnection).not.toHaveBeenCalled();
    expect(abandonTrackedOrganizerWaitingRoom).not.toHaveBeenCalled();
  });
});
