import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  isFinishedArchiveStale,
  playerWordCountsFromSession,
  type FinishedRoundArchive,
} from '../lib/online/online-session-archive.js';
import { buildSyncWorkQueue, SYNC_COORDINATOR_SCAN_LIMIT } from '../lib/online/sync-work-queue.js';

function finishedSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'finished',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: true,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      a: { name: 'A', wordCount: 2, score: 10 },
      b: { name: 'B', wordCount: 1, score: 5 },
    },
    baseWordRound: 0,
    ...overrides,
  };
}

describe('playerWordCountsFromSession', () => {
  it('maps player word counts', () => {
    expect(playerWordCountsFromSession(finishedSession())).toEqual({ a: 2, b: 1 });
  });
});

describe('isFinishedArchiveStale', () => {
  it('returns true when archive is missing', () => {
    expect(isFinishedArchiveStale(null, finishedSession())).toBe(true);
  });

  it('returns false when word counts match', () => {
    const session = finishedSession();
    const archive: FinishedRoundArchive = {
      gameId: 'ABCD',
      baseWordRound: 0,
      savedAt: Date.now(),
      session,
      playerWords: {},
      playerWordCounts: { a: 2, b: 1 },
    };
    expect(isFinishedArchiveStale(archive, session)).toBe(false);
  });

  it('returns true when word counts diverge', () => {
    const session = finishedSession();
    const archive: FinishedRoundArchive = {
      gameId: 'ABCD',
      baseWordRound: 0,
      savedAt: Date.now(),
      session,
      playerWords: {},
      playerWordCounts: { a: 1, b: 1 },
    };
    expect(isFinishedArchiveStale(archive, session)).toBe(true);
  });
});

describe('buildSyncWorkQueue', () => {
  it('dedupes pending and recent archives', () => {
    const queue = buildSyncWorkQueue(
      [{ gameId: 'ABCD', baseWordRound: 0, uid: 'u1', markedAt: 1 }],
      [
        {
          gameId: 'ABCD',
          baseWordRound: 0,
          savedAt: 2,
          session: finishedSession(),
          playerWords: {},
        },
        {
          gameId: 'EFGH',
          baseWordRound: 1,
          savedAt: 3,
          session: finishedSession({ baseWordRound: 1 }),
          playerWords: {},
        },
      ],
      'u2',
    );
    expect(queue).toHaveLength(2);
    expect(queue.find((item) => item.gameId === 'ABCD')?.fromPending).toBe(true);
    expect(queue.find((item) => item.gameId === 'EFGH')?.uid).toBe('u2');
  });

  it('respects scan limit constant', () => {
    expect(SYNC_COORDINATOR_SCAN_LIMIT).toBe(10);
  });
});
