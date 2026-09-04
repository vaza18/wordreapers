import { describe, expect, it } from 'vitest';

import {
  pickRicherWordPlayers,
  sessionWordPlayersRicherThanArchive,
  shouldSkipEmptyArchiveWords,
  wordPlayersClaimLeafCount,
} from '../lib/online/session/archive-words-gate.js';
import { finishedSession } from './helpers/game-session-fixtures.js';

describe('shouldSkipEmptyArchiveWords', () => {
  it('skips empty invert when live wordPlayers still claim words', () => {
    const session = finishedSession();
    session.wordPlayers = { кіт: { org: true } };
    expect(shouldSkipEmptyArchiveWords(session, new Map())).toBe(true);
  });

  it('skips empty invert when an existing archive already has words', () => {
    const session = finishedSession();
    session.wordPlayers = {};
    expect(
      shouldSkipEmptyArchiveWords(session, new Map(), {
        playerWords: { org: ['кіт'] },
      }),
    ).toBe(true);
  });

  it('does not skip when maps have words', () => {
    expect(shouldSkipEmptyArchiveWords(finishedSession(), new Map([['org', ['кіт']]]))).toBe(false);
  });

  it('does not skip empty maps when nothing claims words', () => {
    const session = finishedSession();
    session.wordPlayers = {};
    expect(shouldSkipEmptyArchiveWords(session, new Map())).toBe(false);
  });
});

describe('sessionWordPlayersRicherThanArchive', () => {
  it('is true when memory has more claim-leaves than archive word entries', () => {
    expect(
      sessionWordPlayersRicherThanArchive(
        { кіт: { org: true }, пес: { p2: true } },
        { org: ['кіт'] },
      ),
    ).toBe(true);
  });

  it('is false when memory is empty or not richer', () => {
    expect(sessionWordPlayersRicherThanArchive({}, { org: ['кіт'] })).toBe(false);
    expect(sessionWordPlayersRicherThanArchive({ кіт: { org: true } }, { org: ['кіт'] })).toBe(
      false,
    );
    expect(wordPlayersClaimLeafCount({ кіт: { a: true, b: true } })).toBe(2);
  });
});

describe('pickRicherWordPlayers', () => {
  it('returns the tree with more claim leaves', () => {
    expect(
      pickRicherWordPlayers({ кіт: { org: true } }, { кіт: { org: true }, пес: { p2: true } }),
    ).toEqual({ кіт: { org: true }, пес: { p2: true } });
    expect(
      pickRicherWordPlayers({ кіт: { org: true }, пес: { p2: true } }, { кіт: { org: true } }),
    ).toEqual({ кіт: { org: true }, пес: { p2: true } });
  });
});
