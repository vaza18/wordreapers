import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  RESULTS_EMPTY_CLAIMS_ESCAPE_MS,
  shouldShowOnlineResultsWordsLoading,
} from '../lib/online/session/should-show-online-results-words-loading.js';

/** Historical bootstrap escape (must stay unwired — provisional-as-final regression). */
const HISTORICAL_BOOTSTRAP_ESCAPE_MS = 8_000;

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

  it('does not spin when mapsUnavailable (post-paint fail-loud / C1)', () => {
    // Mirrors left shouldBlockLeftRoundOnMapsBootstrap: mapsUnavailable must not
    // mask banner with ActivityIndicator after wordsBootstrapComplete flipped false.
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        mapsUnavailable: true,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map([['a', ['кіт']]]),
      }),
    ).toBe(false);
  });

  it('does not spin on incomplete bootstrap when words already painted (post-paint Retry)', () => {
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        mapsUnavailable: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map([['a', ['кіт']]]),
      }),
    ).toBe(false);
  });

  it('does not time-escape bootstrap even after historical 8s escape (C1 provisional)', () => {
    // Empty snapshot: incomplete bootstrap must keep spinning (no 8s escape).
    // Non-empty snapshot is covered by post-paint Retry — that must NOT spin.
    expect(
      shouldShowOnlineResultsWordsLoading({
        frozenRound: null,
        wordsBootstrapComplete: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
        nowMs: 1_000 + HISTORICAL_BOOTSTRAP_ESCAPE_MS,
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
