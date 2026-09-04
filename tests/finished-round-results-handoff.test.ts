import { beforeEach, describe, expect, it } from 'vitest';

import { freezeFinishedRound } from '../lib/online/session/frozen-finished-round.js';
import {
  clearFinishedRoundResultsHandoff,
  peekFinishedRoundResultsHandoff,
  resetFinishedRoundResultsHandoff,
  setFinishedRoundResultsHandoff,
} from '../lib/online/session/finished-round-results-handoff.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

describe('finished-round-results-handoff', () => {
  beforeEach(() => {
    resetFinishedRoundResultsHandoff();
  });

  it('peeks matching room/round without consuming', () => {
    const session = finishedSession();
    const words = new Map([['org', ['кіт']]]);
    const frozen = freezeFinishedRound('ABCDE', session, words);
    setFinishedRoundResultsHandoff('ABCDE', 0, frozen);

    expect(peekFinishedRoundResultsHandoff('ABCDE', 0)).toEqual(frozen);
    expect(peekFinishedRoundResultsHandoff('ABCDE', 0)).toEqual(frozen);
  });

  it('ignores mismatched room or round', () => {
    const session = finishedSession();
    setFinishedRoundResultsHandoff(
      'ABCDE',
      0,
      freezeFinishedRound('ABCDE', session, new Map([['org', ['кіт']]])),
    );

    expect(peekFinishedRoundResultsHandoff('OTHER', 0)).toBeNull();
    expect(peekFinishedRoundResultsHandoff('ABCDE', 1)).toBeNull();
  });

  it('clears a matching handoff', () => {
    const session = finishedSession();
    setFinishedRoundResultsHandoff(
      'ABCDE',
      0,
      freezeFinishedRound('ABCDE', session, new Map([['org', ['кіт']]])),
    );
    clearFinishedRoundResultsHandoff('ABCDE', 0);
    expect(peekFinishedRoundResultsHandoff('ABCDE', 0)).toBeNull();
  });
});
