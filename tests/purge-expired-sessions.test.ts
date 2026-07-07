import { describe, expect, it, vi } from 'vitest';

import {
  FINISHED_RETENTION_MS,
  purgeExpiredRtdbSessions,
} from '../functions/src/purge-expired-sessions.js';

function createMockDb() {
  const mockUpdate = vi.fn().mockResolvedValue(undefined);
  const mockOnce = vi.fn();

  const db = {
    ref: (path?: string) => {
      if (path === 'game_sessions') {
        return {
          orderByChild: () => ({
            endAt: () => ({
              once: mockOnce,
            }),
          }),
        };
      }
      return {
        update: mockUpdate,
      };
    },
  };

  return { db, mockUpdate, mockOnce };
}

describe('FINISHED_RETENTION_MS', () => {
  it('matches 7 days in milliseconds', () => {
    expect(FINISHED_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('purgeExpiredRtdbSessions', () => {
  it('returns zero when no sessions match the query', async () => {
    const { db, mockOnce, mockUpdate } = createMockDb();
    mockOnce.mockResolvedValue({
      exists: () => false,
      forEach: () => undefined,
    });

    await expect(purgeExpiredRtdbSessions(1_000, db as never)).resolves.toEqual({
      scanned: 0,
      purged: 0,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('purges sessions whose purgeAfterAt is at or before now', async () => {
    const { db, mockOnce, mockUpdate } = createMockDb();
    mockOnce.mockResolvedValue({
      exists: () => true,
      forEach: (fn: (child: { key: string | null; val: () => unknown }) => void) => {
        fn({
          key: 'game-1',
          val: () => ({
            purgeAfterAt: 500,
            players: { p1: {}, p2: {} },
          }),
        });
        fn({
          key: 'game-2',
          val: () => ({
            purgeAfterAt: 2_000,
            players: { p3: {} },
          }),
        });
        fn({
          key: null,
          val: () => ({ purgeAfterAt: 100 }),
        });
      },
    });

    const result = await purgeExpiredRtdbSessions(1_000, db as never);

    expect(result).toEqual({ scanned: 3, purged: 1 });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      'game_sessions/game-1': null,
      'session_word_maps/game-1': null,
      'player_words/game-1/p1': null,
      'player_words/game-1/p2': null,
    });
  });
});
