import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_LOBBY_TTL_MS,
  countLivePublicLobbyRows,
  purgeStalePublicLobbies,
  shouldPurgeIndexRow,
} from '../functions/src/purge-stale-public-lobbies.js';

type DataSnapshot = Parameters<typeof countLivePublicLobbyRows>[0];

function lobbySnapshot(
  entries: Record<string, { expiresAt?: number; playerCount?: number }>,
  key = 'uk-uk',
): DataSnapshot {
  return {
    exists: () => true,
    key,
    forEach: (fn: (child: { key: string | null; val: () => unknown }) => void) => {
      for (const [gameId, entry] of Object.entries(entries)) {
        fn({ key: gameId, val: () => entry });
      }
    },
  } as DataSnapshot;
}

function createMockDb() {
  const mockRemove = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockResolvedValue(undefined);
  const mockOnce = vi.fn();

  const db = {
    ref: (path: string) => ({
      once: () => mockOnce(path),
      remove: () => mockRemove(path),
      set: (value: unknown) => mockSet(path, value),
    }),
  };

  return { db, mockRemove, mockSet, mockOnce };
}

describe('PUBLIC_LOBBY_TTL_MS', () => {
  it('matches 5 minutes in milliseconds', () => {
    expect(PUBLIC_LOBBY_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe('shouldPurgeIndexRow', () => {
  const now = 10_000;

  it('purges expired index rows', () => {
    expect(shouldPurgeIndexRow({ expiresAt: now }, null, now)).toBe(true);
  });

  it('purges when session is missing', () => {
    expect(shouldPurgeIndexRow({ expiresAt: now + 60_000 }, null, now)).toBe(true);
  });

  it('purges when session is not a public waiting room', () => {
    expect(
      shouldPurgeIndexRow(
        { expiresAt: now + 60_000, playerCount: 2 },
        { status: 'playing', isPublic: true, players: { p1: {} } },
        now,
      ),
    ).toBe(true);
  });

  it('purges when no active players remain', () => {
    expect(
      shouldPurgeIndexRow(
        { expiresAt: now + 60_000, playerCount: 1 },
        {
          status: 'waiting',
          isPublic: true,
          players: { p1: { hasLeft: true } },
        },
        now,
      ),
    ).toBe(true);
  });

  it('keeps valid waiting public lobby rows', () => {
    expect(
      shouldPurgeIndexRow(
        { expiresAt: now + 60_000, playerCount: 2 },
        {
          status: 'waiting',
          isPublic: true,
          players: { p1: { hasLeft: false }, p2: { hasLeft: false } },
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('countLivePublicLobbyRows', () => {
  const now = 10_000;

  it('counts only non-expired rows with positive playerCount', () => {
    const snap = lobbySnapshot({
      live: { expiresAt: now + 60_000, playerCount: 2 },
      expired: { expiresAt: now, playerCount: 1 },
      empty: { expiresAt: now + 60_000, playerCount: 0 },
    });

    expect(countLivePublicLobbyRows(snap, now)).toBe(1);
  });
});

describe('purgeStalePublicLobbies', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns zero when public_lobbies root is empty', async () => {
    const { db, mockOnce } = createMockDb();
    mockOnce.mockImplementation(async (path: string) => {
      if (path === 'public_lobbies') {
        return { exists: () => false, forEach: () => undefined };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    await expect(purgeStalePublicLobbies(10_000, db as never)).resolves.toEqual({
      scanned: 0,
      purged: 0,
    });
  });

  it('removes stale rows and reconciles shard counts', async () => {
    const now = 10_000;
    const { db, mockOnce, mockRemove, mockSet } = createMockDb();

    mockOnce.mockImplementation(async (path: string) => {
      if (path === 'public_lobbies') {
        return {
          exists: () => true,
          forEach: (
            fn: (languageNode: {
              key: string | null;
              forEach: typeof Array.prototype.forEach;
            }) => void,
          ) => {
            fn({
              key: 'uk-uk',
              forEach: (gameFn: (gameNode: { key: string | null; val: () => unknown }) => void) => {
                gameFn({
                  key: 'stale',
                  val: () => ({ expiresAt: now - 1, playerCount: 1 }),
                });
                gameFn({
                  key: 'live',
                  val: () => ({ expiresAt: now + 60_000, playerCount: 2 }),
                });
              },
            } as never);
          },
        };
      }
      if (path === 'game_sessions/stale') {
        return {
          exists: () => true,
          val: () => ({
            status: 'waiting',
            isPublic: true,
            players: { p1: { hasLeft: false } },
          }),
        };
      }
      if (path === 'game_sessions/live') {
        return {
          exists: () => true,
          val: () => ({
            status: 'waiting',
            isPublic: true,
            players: { p1: {}, p2: {} },
          }),
        };
      }
      if (path === 'public_lobbies/uk-uk') {
        return lobbySnapshot({ live: { expiresAt: now + 60_000, playerCount: 2 } }, 'uk-uk');
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await purgeStalePublicLobbies(now, db as never);

    expect(result).toEqual({ scanned: 2, purged: 1 });
    expect(mockRemove).toHaveBeenCalledWith('public_lobbies/uk-uk/stale');
    expect(mockSet).toHaveBeenCalledWith('public_lobby_counts/uk-uk', 1);
  });
});
