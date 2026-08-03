import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  RESULTS_EMPTY_CLAIMS_ESCAPE_MS,
  RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS,
  shouldShowOnlineResultsWordsLoading,
} from '../lib/online/session/should-show-online-results-words-loading.js';

function finishedSession(options: {
  wordPlayers?: GameSession['wordPlayers'];
}): Pick<GameSession, 'status' | 'wordPlayers' | 'players'> {
  return {
    status: 'finished',
    players: { a: { name: 'a', wordCount: 0, score: 0, online: false } },
    wordPlayers: options.wordPlayers ?? {},
  };
}

describe('shouldShowOnlineResultsWordsLoading', () => {
  it('keeps loading until maps bootstrap completes', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(true);
  });

  it('escapes bootstrap loading after RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS without freeze', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
        bootstrapLoadingSinceMs: 1_000,
        nowMs: 1_000 + RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS,
      }),
    ).toBe(false);
  });

  it('keeps bootstrap loading before escape timeout', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
        bootstrapLoadingSinceMs: 1_000,
        nowMs: 1_000 + RESULTS_WORDS_BOOTSTRAP_ESCAPE_MS - 1,
      }),
    ).toBe(true);
  });

  it('keeps loading after bootstrap when empty invert but wordPlayers claim words', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: true,
        session: finishedSession({
          wordPlayers: { кіт: { a: true }, пес: { b: true } },
        }),
        wordsSnapshot: new Map(),
        emptyClaimsLoadingSinceMs: 1_000,
        nowMs: 1_000,
      }),
    ).toBe(true);
  });

  it('escapes empty+claims loading after timeout (unavailable without pending/archive)', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: true,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
        emptyClaimsLoadingSinceMs: 1_000,
        nowMs: 1_000 + RESULTS_EMPTY_CLAIMS_ESCAPE_MS,
      }),
    ).toBe(false);
  });

  it('stops loading when invert has words', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: true,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map([['a', ['кіт']]]),
      }),
    ).toBe(false);
  });

  it('stops loading after bootstrap when nothing claims words', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: true,
        session: finishedSession({ wordPlayers: {} }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(false);
  });

  it('stops loading once a frozen archive is present', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: { session: {} },
        wordsBootstrapComplete: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(false);
  });
});
