import { describe, expect, it } from 'vitest';

import { shouldFinalizeOnlineResultsStats } from '../lib/online/should-finalize-online-results-stats.js';
import type { GameSession } from '../lib/firebase/types.js';

function finishedSession(options: {
  wordPlayers?: GameSession['wordPlayers'];
}): Pick<GameSession, 'status' | 'wordPlayers'> {
  return {
    status: 'finished',
    wordPlayers: options.wordPlayers ?? {},
  };
}

describe('shouldFinalizeOnlineResultsStats', () => {
  it('blocks finalize while empty invert still has map claims (even after escape)', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: null,
        emptyClaimsEscaped: true,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(false);
  });

  it('blocks finalize on empty frozen round while maps still claim words', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: { session: {} },
        emptyClaimsEscaped: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(false);
  });

  it('allows finalize after freeze when words are present', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: { session: {} },
        emptyClaimsEscaped: false,
        session: finishedSession({ wordPlayers: { кіт: { a: true } } }),
        wordsSnapshot: new Map([['a', ['кіт']]]),
      }),
    ).toBe(true);
  });

  it('allows finalize of a true empty finished round (no claims)', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: { session: {} },
        emptyClaimsEscaped: false,
        session: finishedSession({ wordPlayers: {} }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(true);
  });

  it('allows finalize after empty+claims escape once claims are gone', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: null,
        emptyClaimsEscaped: true,
        session: finishedSession({ wordPlayers: {} }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(true);
  });

  it('waits until freeze or escape', () => {
    expect(
      shouldFinalizeOnlineResultsStats({
        frozenRound: null,
        emptyClaimsEscaped: false,
        session: finishedSession({ wordPlayers: {} }),
        wordsSnapshot: new Map(),
      }),
    ).toBe(false);
  });
});
