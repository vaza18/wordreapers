import { describe, expect, it } from 'vitest';

import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';
import type { GameSession } from '../lib/firebase/types.js';
import type { AllPlayerWords } from '../lib/online/session/clone-player-words.js';
import { shouldShowOnlineResultsWordsLoading } from '../lib/online/session/should-show-online-results-words-loading.js';

function finishedSession(counts: Record<string, number>): GameSession {
  return {
    status: 'finished',
    organizerId: 'a',
    players: Object.fromEntries(
      Object.entries(counts).map(([uid, wordCount]) => [
        uid,
        { name: uid, wordCount, score: wordCount, online: false },
      ]),
    ),
  } as GameSession;
}

function wordsMap(entries: Record<string, string[]>): AllPlayerWords {
  return new Map(
    Object.entries(entries).map(([uid, words]) => [
      uid,
      new Map(words.map((word) => [word, { display: word, at: 0 } satisfies StoredPlayerWord])),
    ]),
  );
}

describe('shouldShowOnlineResultsWordsLoading', () => {
  it('keeps loading when finished standings exist but word nodes are missing', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        session: finishedSession({ a: 15, b: 13 }),
        wordsSnapshot: wordsMap({}),
        wordsBootstrapComplete: true,
      }),
    ).toBe(true);
  });

  it('stops loading once a frozen archive is present', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: { session: finishedSession({ a: 1 }) },
        session: finishedSession({ a: 15 }),
        wordsSnapshot: wordsMap({}),
        wordsBootstrapComplete: true,
      }),
    ).toBe(false);
  });

  it('stops loading when live finished words match counts', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        session: finishedSession({ a: 2 }),
        wordsSnapshot: wordsMap({ a: ['foo', 'bar'] }),
        wordsBootstrapComplete: true,
      }),
    ).toBe(false);
  });
});
