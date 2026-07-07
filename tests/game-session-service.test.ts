import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();
const onDisconnectCancel = vi.fn();
const onDisconnectUpdate = vi.fn();

vi.mock('firebase/database', () => ({
  get: (...args: unknown[]) => getMock(...args),
  update: (...args: unknown[]) => updateMock(...args),
  remove: (...args: unknown[]) => removeMock(...args),
  onDisconnect: () => ({
    cancel: () => onDisconnectCancel(),
    update: (...args: unknown[]) => onDisconnectUpdate(...args),
  }),
  ref: (_db: unknown, path: string) => ({ path }),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/public-lobby-service.js', () => ({
  unpublishPublicLobby: vi.fn(),
}));

vi.mock('../lib/firebase/player-words-service.js', () => ({
  clearAllPlayerWords: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  clearSessionWordMaps: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: vi.fn().mockResolvedValue({ uid: 'org-1' }),
  getFirebaseUid: vi.fn().mockReturnValue('org-1'),
}));

vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `game_sessions/${gameId}` }),
}));

import {
  abandonWaitingGameSession,
  beginVoluntaryLeave,
  markPlayerOffline,
  markPlayerOnline,
  organizerLeaveWaitingLobby,
  tryReadGameSessionSnapshot,
} from '../lib/firebase/game-session-service.js';
import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';

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

describe('game-session-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onDisconnectCancel.mockResolvedValue(undefined);
    onDisconnectUpdate.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    removeMock.mockResolvedValue(undefined);
  });

  it('marks an existing player online and registers disconnect cleanup', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Org', wordCount: 0, score: 0, online: false }),
    });

    await markPlayerOnline('ABCD', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: true });
    expect(onDisconnectUpdate).toHaveBeenCalledWith({ online: false });
  });

  it('skips mark online while voluntary leave is in flight', async () => {
    beginVoluntaryLeave('ABCD', 'org-1');

    await markPlayerOnline('ABCD', 'org-1');

    expect(getMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('marks an existing player offline', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => ({ name: 'Org', wordCount: 0, score: 0, online: true }),
    });

    await markPlayerOffline('ABCD', 'org-1');

    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { online: false });
  });

  it('returns null when the room snapshot is missing', async () => {
    getMock.mockResolvedValue({ exists: () => false });

    await expect(tryReadGameSessionSnapshot('ABCD')).resolves.toBeNull();
  });

  it('deletes a solo waiting room when the organizer abandons it', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await abandonWaitingGameSession('ABCD', 'org-1');

    expect(removeMock).toHaveBeenCalled();
  });

  it('organizer leave waiting lobby deletes the room when alone online', async () => {
    getMock.mockResolvedValue({
      exists: () => true,
      val: () => waitingSession,
    });

    await organizerLeaveWaitingLobby('ABCD', 'org-1', waitingSession);

    expect(removeMock).toHaveBeenCalled();
  });
});
