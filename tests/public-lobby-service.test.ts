import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/database', async () => {
  const { firebaseDatabaseMockFactory } = await import('./helpers/mock-firebase-rtdb.js');
  return firebaseDatabaseMockFactory();
});
vi.mock('../lib/firebase/init.js', async () => {
  const { firebaseInitMockFactory } = await import('./helpers/mock-firebase-rtdb.js');
  return firebaseInitMockFactory();
});

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 1_000_000,
}));

import {
  getFirebaseRtdbMocks,
  resetFirebaseRtdbMocks,
  rtdbSnapshot,
} from './helpers/mock-firebase-rtdb.js';
import { waitingSession } from './helpers/game-session-fixtures.js';
import {
  activePublicLobbyPlayerCount,
  setRoomPrivate,
  setRoomPublic,
  syncPublicLobbyPlayerCount,
  fetchPublicLobbyCount,
  unpublishPublicLobby,
} from '../lib/firebase/public-lobby-service.js';

const {
  get: getMock,
  set: setMock,
  update: updateMock,
  remove: removeMock,
} = getFirebaseRtdbMocks();

describe('setRoomPublic', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('publishes safe waiting room without touching counter node', async () => {
    getMock.mockResolvedValueOnce(rtdbSnapshot(waitingSession()));
    await setRoomPublic('ABCD', 'org', ['портрет', 'компютер']);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('game_sessions/ABCD') }),
      expect.objectContaining({
        isPublic: true,
        maxPlayers: 8,
        settings: expect.objectContaining({ allowSlang: false, allowProperNouns: false }),
      }),
    );
    expect(setMock).toHaveBeenCalled();
  });

  it('rejects unsafe base word', async () => {
    getMock.mockResolvedValueOnce(rtdbSnapshot(waitingSession({ baseWord: 'няшка' })));
    await expect(setRoomPublic('ABCD', 'org', ['портрет'])).rejects.toThrow(
      'BASE_WORD_NOT_ALLOWED_PUBLIC',
    );
  });
});

describe('setRoomPrivate', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    removeMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('removes index row, clears session flag, and drops stale aliases', async () => {
    getMock.mockResolvedValueOnce(
      rtdbSnapshot(
        waitingSession({
          isPublic: true,
          players: {
            org: {
              name: 'Org',
              wordCount: 0,
              score: 0,
              avatarColorIndex: 0,
              publicAlias: 'Гравець 1',
            },
          },
        }),
      ),
    );
    await setRoomPrivate('ABCD', 'org');
    expect(removeMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isPublic: false,
        publicPublishedAt: null,
        'players/org/publicAlias': null,
      }),
    );
  });
});

describe('syncPublicLobbyPlayerCount', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it('updates browse index playerCount for public sessions', async () => {
    await syncPublicLobbyPlayerCount('ABCD', {
      isPublic: true,
      settings: waitingSession().settings,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        guest: { name: 'Guest', wordCount: 0, score: 0 },
      },
    });
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), { playerCount: 2 });
  });

  it('no-ops for private sessions', async () => {
    await syncPublicLobbyPlayerCount('ABCD', {
      isPublic: false,
      settings: waitingSession().settings,
      players: { org: { name: 'Org', wordCount: 0, score: 0 } },
    });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('fetchPublicLobbyCount', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
  });

  it('returns counter value when present', async () => {
    getMock.mockResolvedValueOnce(rtdbSnapshot(3));
    await expect(fetchPublicLobbyCount('uk-uk')).resolves.toBe(3);
  });

  it('returns null for invalid counter values', async () => {
    getMock.mockResolvedValueOnce(rtdbSnapshot('bad'));
    await expect(fetchPublicLobbyCount('uk-uk')).resolves.toBeNull();
  });
});

describe('activePublicLobbyPlayerCount', () => {
  it('counts only active roster members', () => {
    expect(
      activePublicLobbyPlayerCount({
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', wordCount: 0, score: 0, online: false, hasLeft: true },
      }),
    ).toBe(1);
  });
});

describe('unpublishPublicLobby', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    removeMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('removes public lobby index row for organizer', async () => {
    getMock.mockResolvedValueOnce(
      rtdbSnapshot(
        waitingSession({
          isPublic: true,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
          },
        }),
      ),
    );

    await unpublishPublicLobby('ABCD', 'org', { clearSessionFlag: true });

    expect(removeMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPublic: false }),
    );
  });
});
