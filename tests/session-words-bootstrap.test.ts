import { describe, expect, it } from 'vitest';

import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';
import type { GameSession } from '../lib/firebase/types.js';
import type { AllPlayerWords } from '../lib/online/clone-player-words.js';
import { isSessionWordsSnapshotReady } from '../lib/online/session-words-bootstrap.js';

function sessionWithCounts(counts: Record<string, number>): GameSession {
  return {
    status: 'finished',
    organizerId: 'a',
    players: Object.fromEntries(
      Object.entries(counts).map(([uid, wordCount]) => [
        uid,
        { displayName: uid, wordCount, score: wordCount },
      ]),
    ),
  } as unknown as GameSession;
}

function stubWord(normalized: string): StoredPlayerWord {
  return {
    display: normalized,
    kind: 'unique',
    points: 1,
    badge: null,
    at: 0,
  };
}

function wordsMap(entries: Record<string, string[]>): AllPlayerWords {
  return new Map(
    Object.entries(entries).map(([uid, words]) => [
      uid,
      new Map(words.map((word) => [word, stubWord(word)])),
    ]),
  );
}

describe('isSessionWordsSnapshotReady', () => {
  it('returns true when every player with wordCount has words loaded', () => {
    const session = sessionWithCounts({ a: 3, b: 2 });
    const words = wordsMap({ a: ['foo', 'bar', 'baz'], b: ['one', 'two'] });
    expect(isSessionWordsSnapshotReady(session, words)).toBe(true);
  });

  it('returns false when a player with wordCount has an empty word map', () => {
    const session = sessionWithCounts({ a: 3, b: 2 });
    const words = wordsMap({ b: ['one', 'two'] });
    expect(isSessionWordsSnapshotReady(session, words)).toBe(false);
  });

  it('ignores players with zero wordCount', () => {
    const session = sessionWithCounts({ a: 0, b: 2 });
    const words = wordsMap({ b: ['one', 'two'] });
    expect(isSessionWordsSnapshotReady(session, words)).toBe(true);
  });
});
