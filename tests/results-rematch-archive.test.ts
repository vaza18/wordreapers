import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  isFinishedArchiveStale,
  isLegacyFinishedArchiveWords,
} from '../lib/online/session/online-session-archive.js';

function finishedSession(baseWordRound: number): GameSession {
  return {
    baseWord: 'тест',
    status: 'finished',
    baseWordRound,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'a',
    players: {
      a: { name: 'A', wordCount: 1, score: 1 },
      b: { name: 'B', wordCount: 1, score: 1 },
    },
  };
}

describe('results rematch archive staleness', () => {
  it('treats prior-round ack as stale for the current finished session', () => {
    const round0Archive = {
      gameId: 'ABCDE',
      baseWordRound: 0,
      savedAt: 1,
      session: finishedSession(0),
      playerWords: {},
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
    };
    const round1Live = finishedSession(1);

    expect(isFinishedArchiveStale(round0Archive, round1Live)).toBe(true);
  });

  it('accepts ack for the same round with matching words', () => {
    const round1Archive = {
      gameId: 'ABCDE',
      baseWordRound: 1,
      savedAt: 2,
      session: finishedSession(1),
      playerWords: { a: ['а'], b: ['б'] },
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
      archiveVersion: 4 as const,
    };

    expect(isFinishedArchiveStale(round1Archive, finishedSession(1))).toBe(false);
  });

  it('treats archive as stale when merged wordPlayers grew past archived words', () => {
    const round1Archive = {
      gameId: 'ABCDE',
      baseWordRound: 1,
      savedAt: 2,
      session: finishedSession(1),
      playerWords: { a: ['а'] },
      ackSent: true as const,
      playerWordCounts: { a: 1 },
      archiveVersion: 4 as const,
    };
    const live = finishedSession(1);
    live.wordPlayers = { а: { a: true }, б: { b: true } };

    expect(isFinishedArchiveStale(round1Archive, live)).toBe(true);
  });

  it('treats empty words with non-zero counts as stale', () => {
    const emptyWordsArchive = {
      gameId: 'ABCDE',
      baseWordRound: 1,
      savedAt: 2,
      session: finishedSession(1),
      playerWords: {},
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
      archiveVersion: 4 as const,
    };

    expect(isFinishedArchiveStale(emptyWordsArchive, finishedSession(1))).toBe(true);
  });

  it('does not mark pre-v4 object-shaped words as stale (avoid empty overwrite)', () => {
    const v3Archive = {
      gameId: 'ABCDE',
      baseWordRound: 1,
      savedAt: 2,
      session: finishedSession(1),
      // Legacy StoredPlayerWord-shaped leaves (not string[])
      playerWords: {
        a: { порт: { display: 'ПОРТ', at: 1 } },
        b: { рот: { display: 'РОТ', at: 2 } },
      } as unknown as Record<string, string[]>,
      ackSent: true as const,
      playerWordCounts: { a: 1, b: 1 },
    };

    expect(isLegacyFinishedArchiveWords(v3Archive)).toBe(true);
    expect(isFinishedArchiveStale(v3Archive, finishedSession(1))).toBe(false);
  });
});
