import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SESSION_SETTINGS } from './helpers/game-session-fixtures.js';
import {
  firebaseDatabaseMockFactory,
  firebaseInitMockFactory,
  getFirebaseRtdbMocks,
  resetFirebaseRtdbMocks,
  rtdbSnapshot,
} from './helpers/mock-firebase-rtdb.js';

const findActiveRoundCacheForGame = vi.fn();
const removeOrphanGameSessionShell = vi.fn();
const writeSessionWordMapsShards = vi.fn();
const joinGameSession = vi.fn();
const ensureAnonymousAuth = vi.fn();

vi.mock('firebase/database', () => firebaseDatabaseMockFactory());
vi.mock('../lib/firebase/init.js', () => firebaseInitMockFactory());
vi.mock('../lib/firebase/session-ref.js', () => ({
  sessionRef: (gameId: string) => ({ path: `sessions/${gameId}` }),
}));
vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 2_000_000,
}));
vi.mock('../lib/online/session/active-round-cache.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/online/session/active-round-cache.js')>();
  return {
    ...actual,
    findActiveRoundCacheForGame: (...args: unknown[]) => findActiveRoundCacheForGame(...args),
  };
});
vi.mock('../lib/firebase/game-session-service.js', () => ({
  joinGameSession: (...args: unknown[]) => joinGameSession(...args),
  removeOrphanGameSessionShell: (...args: unknown[]) => removeOrphanGameSessionShell(...args),
}));
vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  writeSessionWordMapsShards: (...args: unknown[]) => writeSessionWordMapsShards(...args),
}));
vi.mock('../lib/firebase/auth.js', () => ({
  ensureAnonymousAuth: () => ensureAnonymousAuth(),
}));

import type { ActiveRoundCacheEntry } from '../lib/online/session/active-round-cache.js';
import {
  rejoinOnlineRound,
  restorePlayingSessionFromLocalCache,
} from '../lib/online/session/rejoin-online-round.js';

function cacheEntry(overrides: Partial<ActiveRoundCacheEntry> = {}): ActiveRoundCacheEntry {
  return {
    gameId: 'ABCDE',
    baseWordRound: 0,
    timerEndsAt: 2_500_000,
    sessionSnapshot: {
      baseWord: 'тест',
      settings: DEFAULT_SESSION_SETTINGS,
      timerEndsAt: 2_500_000,
      organizerId: 'org',
      baseWordRound: 0,
      players: {
        org: { name: 'Org', wordCount: 1, score: 1 },
      },
      wordPlayers: { порт: { org: true } },
    },
    ...overrides,
  };
}

describe('restorePlayingSessionFromLocalCache', () => {
  const { get, set } = getFirebaseRtdbMocks();

  beforeEach(() => {
    resetFirebaseRtdbMocks();
    vi.clearAllMocks();
    findActiveRoundCacheForGame.mockResolvedValue(cacheEntry());
    removeOrphanGameSessionShell.mockResolvedValue(true);
    writeSessionWordMapsShards.mockResolvedValue(undefined);
    set.mockResolvedValue(undefined);
    getFirebaseRtdbMocks().remove.mockResolvedValue(undefined);
  });

  it('throws when local cache cannot be restored', async () => {
    findActiveRoundCacheForGame.mockResolvedValue(null);

    await expect(restorePlayingSessionFromLocalCache('ABCDE', 'org')).rejects.toThrow(
      'NO_RESTORABLE_LOCAL_CACHE',
    );
  });

  it('throws when RTDB session is finished', async () => {
    get.mockResolvedValueOnce(
      rtdbSnapshot({
        status: 'finished',
        organizerId: 'org',
        players: {},
      }),
    );

    await expect(restorePlayingSessionFromLocalCache('ABCDE', 'org')).rejects.toThrow(
      'ROUND_ALREADY_FINISHED',
    );
  });

  it('throws when RTDB session is not playing', async () => {
    get.mockResolvedValueOnce(
      rtdbSnapshot({
        status: 'waiting',
        organizerId: 'org',
        players: {},
      }),
    );

    await expect(restorePlayingSessionFromLocalCache('ABCDE', 'org')).rejects.toThrow(
      'ROOM_NOT_JOINABLE',
    );
  });

  it('throws when orphan shell cannot be removed', async () => {
    get.mockResolvedValueOnce(
      rtdbSnapshot({
        players: { org: { online: false } },
      }),
    );
    removeOrphanGameSessionShell.mockResolvedValue(false);

    await expect(restorePlayingSessionFromLocalCache('ABCDE', 'org')).rejects.toThrow(
      'NO_RESTORABLE_LOCAL_CACHE',
    );
  });

  it('recreates session from cache after removing orphan shell', async () => {
    get
      .mockResolvedValueOnce(
        rtdbSnapshot({
          players: { org: { online: false } },
        }),
      )
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(
        rtdbSnapshot({
          status: 'playing',
          organizerId: 'org',
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          players: { org: { name: 'Org', wordCount: 1, score: 1 } },
        }),
      );

    const snap = await restorePlayingSessionFromLocalCache('ABCDE', 'org');

    expect(removeOrphanGameSessionShell).toHaveBeenCalledWith('ABCDE', 'org');
    expect(set).toHaveBeenCalled();
    expect(writeSessionWordMapsShards).toHaveBeenCalledWith('ABCDE', {
      wordPlayers: { порт: { org: true } },
    });
    expect(snap.id).toBe('ABCDE');
    expect(snap.status).toBe('playing');
  });

  it('writes session core and restores word maps when room is missing', async () => {
    get
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(
        rtdbSnapshot({
          status: 'playing',
          organizerId: 'org',
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          players: { org: { name: 'Org', wordCount: 1, score: 1 } },
        }),
      );

    await restorePlayingSessionFromLocalCache('abcde', 'org');

    expect(set).toHaveBeenCalledWith(
      { path: 'sessions/ABCDE' },
      expect.objectContaining({
        status: 'playing',
        baseWord: 'тест',
        organizerId: 'org',
      }),
    );
    expect(writeSessionWordMapsShards).toHaveBeenCalled();
  });

  it('restores only the actor wordPlayers leaves from a multiplayer cache', async () => {
    findActiveRoundCacheForGame.mockResolvedValue(
      cacheEntry({
        sessionSnapshot: {
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          organizerId: 'org',
          baseWordRound: 0,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0 },
            peer: { name: 'Peer', wordCount: 0, score: 0 },
          },
          wordPlayers: { порт: { org: true, peer: true }, рот: { peer: true } },
        },
      }),
    );
    get
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(
        rtdbSnapshot({
          status: 'playing',
          organizerId: 'org',
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0 },
            peer: { name: 'Peer', wordCount: 0, score: 0 },
          },
        }),
      );

    await restorePlayingSessionFromLocalCache('ABCDE', 'org');

    expect(writeSessionWordMapsShards).toHaveBeenCalledWith('ABCDE', {
      wordPlayers: { порт: { org: true } },
    });
  });

  it('rolls back the restored session when maps write fails', async () => {
    const { remove } = getFirebaseRtdbMocks();
    writeSessionWordMapsShards.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    get
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(rtdbSnapshot(null, false));

    await expect(restorePlayingSessionFromLocalCache('ABCDE', 'org')).rejects.toThrow(
      'PERMISSION_DENIED',
    );

    expect(set).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith({ path: 'sessions/ABCDE' });
  });

  it('skips word map shards when cache has none', async () => {
    findActiveRoundCacheForGame.mockResolvedValue(
      cacheEntry({
        sessionSnapshot: {
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          organizerId: 'org',
          baseWordRound: 0,
          players: { org: { name: 'Org', wordCount: 0, score: 0 } },
        },
      }),
    );
    get
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(
        rtdbSnapshot({
          status: 'playing',
          organizerId: 'org',
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          players: { org: { name: 'Org', wordCount: 0, score: 0 } },
        }),
      );

    await restorePlayingSessionFromLocalCache('ABCDE', 'org');

    expect(writeSessionWordMapsShards).not.toHaveBeenCalled();
  });
});

describe('rejoinOnlineRound', () => {
  beforeEach(() => {
    resetFirebaseRtdbMocks();
    vi.clearAllMocks();
    ensureAnonymousAuth.mockResolvedValue({ uid: 'guest-1' });
    joinGameSession.mockResolvedValue({ id: 'ABCDE', status: 'playing' });
    findActiveRoundCacheForGame.mockResolvedValue(cacheEntry());
    removeOrphanGameSessionShell.mockResolvedValue(true);
    writeSessionWordMapsShards.mockResolvedValue(undefined);
    getFirebaseRtdbMocks().set.mockResolvedValue(undefined);
  });

  it('returns join result when room exists', async () => {
    const session = { id: 'ABCDE', status: 'playing' as const };
    joinGameSession.mockResolvedValue(session);

    const result = await rejoinOnlineRound('ABCDE', {
      name: 'Guest',
      gender: 'm',
      avatarColorIndex: 0,
    });

    expect(result).toBe(session);
    expect(joinGameSession).toHaveBeenCalledTimes(1);
    expect(ensureAnonymousAuth).not.toHaveBeenCalled();
  });

  it('restores from cache and rejoins when room is missing', async () => {
    joinGameSession
      .mockRejectedValueOnce(new Error('ROOM_NOT_FOUND'))
      .mockResolvedValueOnce({ id: 'ABCDE', status: 'playing' });

    const { get } = getFirebaseRtdbMocks();
    get
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(rtdbSnapshot(null, false))
      .mockResolvedValueOnce(
        rtdbSnapshot({
          status: 'playing',
          organizerId: 'org',
          baseWord: 'тест',
          settings: DEFAULT_SESSION_SETTINGS,
          timerEndsAt: 2_500_000,
          players: { org: { name: 'Org', wordCount: 0, score: 0 } },
        }),
      );

    const result = await rejoinOnlineRound('ABCDE', {
      name: 'Guest',
      gender: 'm',
      avatarColorIndex: 0,
    });

    expect(ensureAnonymousAuth).toHaveBeenCalled();
    expect(joinGameSession).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('ABCDE');
  });

  it('rethrows non-ROOM_NOT_FOUND join errors', async () => {
    joinGameSession.mockRejectedValue(new Error('ROOM_FULL'));

    await expect(
      rejoinOnlineRound('ABCDE', { name: 'Guest', gender: 'm', avatarColorIndex: 0 }),
    ).rejects.toThrow('ROOM_FULL');
  });
});
