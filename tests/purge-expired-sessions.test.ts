import { describe, expect, it, vi } from 'vitest';

import {
  ABANDONED_RETENTION_MS,
  FINISHED_RETENTION_MS,
  purgeExpiredRtdbSessions,
  shouldPurgeAbandonedSession,
  shouldPurgeFinishedSession,
  shouldPurgeSession,
} from '../functions/src/purge-expired-sessions.js';

function createMockDb(sessions: Record<string, unknown>) {
  const mockUpdate = vi.fn().mockResolvedValue(undefined);

  const db = {
    ref: (path?: string) => {
      if (path === 'game_sessions') {
        return {
          once: async () => ({
            exists: () => Object.keys(sessions).length > 0,
            forEach: (fn: (child: { key: string | null; val: () => unknown }) => void) => {
              for (const [key, val] of Object.entries(sessions)) {
                fn({ key, val: () => val });
              }
            },
          }),
        };
      }
      return {
        update: mockUpdate,
      };
    },
  };

  return { db, mockUpdate };
}

describe('FINISHED_RETENTION_MS', () => {
  it('matches 7 days in milliseconds', () => {
    expect(FINISHED_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(ABANDONED_RETENTION_MS).toBe(FINISHED_RETENTION_MS);
  });
});

describe('shouldPurgeFinishedSession', () => {
  it('purges when purgeAfterAt has passed', () => {
    expect(shouldPurgeFinishedSession({ purgeAfterAt: 500 }, 1_000)).toBe(true);
    expect(shouldPurgeFinishedSession({ purgeAfterAt: 2_000 }, 1_000)).toBe(false);
  });
});

describe('shouldPurgeAbandonedSession', () => {
  const now = 10_000_000;
  const retention = ABANDONED_RETENTION_MS;

  it('purges old waiting rooms by createdAt', () => {
    expect(
      shouldPurgeAbandonedSession({ status: 'waiting', createdAt: now - retention - 1 }, now),
    ).toBe(true);
    expect(shouldPurgeAbandonedSession({ status: 'waiting', createdAt: now - 1_000 }, now)).toBe(
      false,
    );
  });

  it('purges stuck playing rooms by roundStartedAt', () => {
    expect(
      shouldPurgeAbandonedSession(
        {
          status: 'playing',
          createdAt: now - retention - 1,
          roundStartedAt: now - retention - 1,
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldPurgeAbandonedSession(
        {
          status: 'playing',
          createdAt: now - retention - 1,
          roundStartedAt: now - 1_000,
        },
        now,
      ),
    ).toBe(false);
  });

  it('purges waiting/playing without createdAt immediately', () => {
    expect(shouldPurgeAbandonedSession({ status: 'waiting' }, now)).toBe(true);
    expect(shouldPurgeAbandonedSession({ status: 'playing' }, now)).toBe(true);
  });

  it('skips rooms still inside finished purgeAfterAt window', () => {
    expect(
      shouldPurgeAbandonedSession(
        { status: 'waiting', createdAt: 1, purgeAfterAt: now + 1_000 },
        now,
      ),
    ).toBe(false);
  });
});

describe('purgeExpiredRtdbSessions', () => {
  it('returns zero when no sessions exist', async () => {
    const { db, mockUpdate } = createMockDb({});
    await expect(purgeExpiredRtdbSessions(1_000, db as never)).resolves.toEqual({
      scanned: 0,
      purged: 0,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('purges finished and abandoned sessions and deletes wholesale paths', async () => {
    const { db, mockUpdate } = createMockDb({
      'game-1': {
        status: 'finished',
        purgeAfterAt: 500,
        players: { p1: {}, p2: {} },
      },
      'game-2': {
        status: 'finished',
        purgeAfterAt: 2_000,
        players: { p3: {} },
      },
      'game-3': {
        status: 'waiting',
        // Missing createdAt → purge immediately as pre-migration orphan.
      },
      'game-4': {
        status: 'playing',
        createdAt: Date.now(),
        roundStartedAt: Date.now(),
      },
    });

    const result = await purgeExpiredRtdbSessions(1_000, db as never);

    expect(result.scanned).toBe(4);
    expect(result.purged).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith({
      'game_sessions/game-1': null,
      'session_word_maps/game-1': null,
      'player_words/game-1': null,
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      'game_sessions/game-3': null,
      'session_word_maps/game-3': null,
      'player_words/game-3': null,
    });
    expect(shouldPurgeSession({ status: 'playing', createdAt: Date.now() }, 1_000)).toBe(false);
  });
});
