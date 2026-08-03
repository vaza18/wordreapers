import { describe, expect, it } from 'vitest';

import { shouldSkipEmptyArchiveWords } from '../lib/online/session/archive-words-gate.js';
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
