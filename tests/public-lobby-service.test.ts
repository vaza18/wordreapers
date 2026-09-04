import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureAnonymousAuth = vi.fn();

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

vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

import {
  getFirebaseRtdbMocks,
  resetFirebaseRtdbMocks,
  rtdbSnapshot,
} from './helpers/mock-firebase-rtdb.js';
import { waitingSession, PUBLIC_LOBBY_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';
import {
  activePublicLobbyPlayerCount,
  setRoomPrivate,
  setRoomPublic,
  syncPublicLobbyPlayerCount,
  fetchPublicLobbyCount,
  fetchPublicLobbyPage,
  reconcilePublicLobbyAfterRosterChange,
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
    ensureAnonymousAuth.mockResolvedValue({ uid: 'tester' });
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('publishes safe waiting room without touching counter node', async () => {
    getMock.mockResolvedValueOnce(rtdbSnapshot(waitingSession()));
    await setRoomPublic('ABCDE', 'org', ['портрет', 'компютер']);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('game_sessions/ABCDE') }),
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
    await expect(setRoomPublic('ABCDE', 'org', ['портрет'])).rejects.toThrow(
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
    await setRoomPrivate('ABCDE', 'org');
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
    await syncPublicLobbyPlayerCount('ABCDE', {
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
    await syncPublicLobbyPlayerCount('ABCDE', {
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

    await unpublishPublicLobby('ABCDE', 'org', { clearSessionFlag: true });

    expect(removeMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isPublic: false }),
    );
  });
});

describe('fetchPublicLobbyPage', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    ensureAnonymousAuth.mockResolvedValue({ uid: 'tester' });
    getMock.mockReset();
  });

  it('awaits anonymous auth (App Check + Auth) before reading lobby count', async () => {
    const callOrder: string[] = [];
    ensureAnonymousAuth.mockImplementation(async () => {
      callOrder.push('auth');
      return { uid: 'tester' };
    });
    getMock.mockImplementation(async (ref: { path?: string }) => {
      callOrder.push(`get:${String(ref?.path)}`);
      if (String(ref?.path).includes('public_lobby_counts')) {
        return rtdbSnapshot(0);
      }
      return {
        exists: () => true,
        val: () => ({}),
        forEach: (_fn: (child: { key: string; val: () => unknown }) => void) => {
          return false;
        },
      };
    });

    await fetchPublicLobbyPage('uk', 'newest', 1);

    expect(callOrder[0]).toBe('auth');
    expect(callOrder.some((step) => step.startsWith('get:'))).toBe(true);
  });

  it('does not read RTDB when anonymous auth fails', async () => {
    ensureAnonymousAuth.mockRejectedValue(new Error('APP_CHECK_TOKEN_EMPTY'));

    await expect(fetchPublicLobbyPage('uk', 'newest', 1)).rejects.toThrow('APP_CHECK_TOKEN_EMPTY');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('returns an empty page when total count is zero', async () => {
    getMock.mockImplementation(async (ref: { path?: string }) => {
      if (String(ref?.path).includes('public_lobby_counts')) {
        return rtdbSnapshot(0);
      }
      return {
        exists: () => true,
        val: () => ({}),
        forEach: (_fn: (child: { key: string; val: () => unknown }) => void) => {
          return false;
        },
      };
    });

    const page = await fetchPublicLobbyPage('uk', 'newest', 1);

    expect(ensureAnonymousAuth).toHaveBeenCalled();
    expect(page.total).toBe(0);
    expect(page.rows).toEqual([]);
  });

  it('reconciles inflated counter when expired index rows leave a short first page', async () => {
    const now = 1_000_000;
    const liveEntry = {
      baseWord: 'університет',
      baseWordNorm: 'університет',
      playerCount: 1,
      maxPlayers: 8,
      publishedAt: now - 60_000,
      expiresAt: now + 240_000,
    };
    const expiredEntry = {
      ...liveEntry,
      baseWord: 'портрет',
      baseWordNorm: 'портрет',
      publishedAt: now - 400_000,
      expiresAt: now - 100_000,
    };
    const entries: Record<string, typeof liveEntry> = {
      LIVE1: liveEntry,
      OLD1: expiredEntry,
      OLD2: { ...expiredEntry, baseWord: 'компютер', baseWordNorm: 'компютер' },
    };
    const shardSnapshot = {
      exists: () => true,
      val: () => entries,
      forEach: (fn: (child: { key: string; val: () => unknown }) => void) => {
        for (const [key, value] of Object.entries(entries)) {
          fn({ key, val: () => value });
        }
        return false;
      },
    };

    getMock.mockImplementation(async (target: { path?: string }) => {
      if (String(target?.path ?? '').includes('public_lobby_counts')) {
        return rtdbSnapshot(3);
      }
      return shardSnapshot;
    });

    const page = await fetchPublicLobbyPage('uk-uk', 'newest', 1);

    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.gameId).toBe('LIVE1');
    expect(page.total).toBe(1);
    expect(page.totalPages).toBe(1);
  });

  it('awaits anonymous auth before reading public lobby count directly', async () => {
    const callOrder: string[] = [];
    ensureAnonymousAuth.mockImplementation(async () => {
      callOrder.push('auth');
      return { uid: 'tester' };
    });
    getMock.mockImplementation(async (ref: { path?: string }) => {
      callOrder.push(`get:${String(ref?.path)}`);
      return rtdbSnapshot(0);
    });

    await expect(fetchPublicLobbyCount('uk')).resolves.toBe(0);

    expect(callOrder[0]).toBe('auth');
    expect(callOrder[1]).toContain('public_lobby_counts');
  });
});

describe('reconcilePublicLobbyAfterRosterChange', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it('updates browse index playerCount for waiting public rooms', async () => {
    await reconcilePublicLobbyAfterRosterChange(
      'ABCDE',
      waitingSession({
        isPublic: true,
        settings: PUBLIC_LOBBY_SESSION_SETTINGS,
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          guest: { name: 'Guest', wordCount: 0, score: 0, online: true },
        },
      }),
    );

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.stringContaining('public_lobbies/uk-uk/ABCDE') }),
      { playerCount: 2 },
    );
  });

  it('no-ops for private or non-waiting sessions', async () => {
    await reconcilePublicLobbyAfterRosterChange('ABCDE', waitingSession());
    await reconcilePublicLobbyAfterRosterChange(
      'ABCDE',
      waitingSession({ isPublic: true, status: 'playing' }),
    );

    expect(updateMock).not.toHaveBeenCalled();
  });
});
