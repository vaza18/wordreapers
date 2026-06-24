import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';

const getMock = vi.fn();
const setMock = vi.fn();
const updateMock = vi.fn();
const removeMock = vi.fn();

vi.mock('firebase/database', () => ({
  endAt: (...args: unknown[]) => ({ type: 'endAt', args }),
  get: (...args: unknown[]) => getMock(...args),
  limitToFirst: (n: number) => ({ type: 'limitToFirst', n }),
  limitToLast: (n: number) => ({ type: 'limitToLast', n }),
  orderByChild: (key: string) => ({ type: 'orderByChild', key }),
  query: (...args: unknown[]) => ({ type: 'query', args }),
  ref: (_db: unknown, path: string) => ({ path }),
  remove: (...args: unknown[]) => removeMock(...args),
  set: (...args: unknown[]) => setMock(...args),
  startAt: (...args: unknown[]) => ({ type: 'startAt', args }),
  update: (...args: unknown[]) => updateMock(...args),
}));

vi.mock('../lib/firebase/init.js', () => ({
  getFirebaseDatabase: () => ({}),
}));

vi.mock('../lib/firebase/server-clock.js', () => ({
  getServerNow: () => 1_000_000,
}));

import {
  setRoomPrivate,
  setRoomPublic,
  syncPublicLobbyPlayerCount,
  fetchPublicLobbyCount,
} from '../lib/firebase/public-lobby-service.js';

function waitingSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'портрет',
    status: 'waiting',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: true,
      allowSlang: true,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, avatarColorIndex: 0 },
    },
    ...overrides,
  };
}

describe('setRoomPublic', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset();
    updateMock.mockReset();
    setMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('publishes safe waiting room without touching counter node', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => waitingSession(),
    });
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
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => waitingSession({ baseWord: 'няшка' }),
    });
    await expect(setRoomPublic('ABCD', 'org', ['портрет'])).rejects.toThrow(
      'BASE_WORD_NOT_ALLOWED_PUBLIC',
    );
  });
});

describe('setRoomPrivate', () => {
  beforeEach(() => {
    getMock.mockReset();
    removeMock.mockReset();
    updateMock.mockReset();
    removeMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it('removes index row, clears session flag, and drops stale aliases', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () =>
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
    });
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
    updateMock.mockReset();
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
    getMock.mockReset();
  });

  it('returns counter value when present', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => 3,
    });
    await expect(fetchPublicLobbyCount('uk-uk')).resolves.toBe(3);
  });

  it('returns null for invalid counter values', async () => {
    getMock.mockResolvedValueOnce({
      exists: () => true,
      val: () => 'bad',
    });
    await expect(fetchPublicLobbyCount('uk-uk')).resolves.toBeNull();
  });
});
