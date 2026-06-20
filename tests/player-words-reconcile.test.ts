import { describe, expect, it } from 'vitest';

import type { StoredPlayerWord } from '../lib/firebase/player-words-service.js';
import type { GameSession } from '../lib/firebase/types.js';
import {
  roundStartMsFromSession,
  wordsAreFromPreviousRound,
} from '../lib/online/stale-player-words.js';

function word(at: number): StoredPlayerWord {
  return { display: 'ТЕСТ', at };
}

function playingSession(timerEndsAt: number): GameSession {
  return {
    baseWord: 'слово',
    status: 'playing',
    settings: {
      durationSeconds: 900,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt,
    organizerId: 'org',
    players: { org: { name: 'Org', score: 0, wordCount: 0 } },
  };
}

describe('wordsAreFromPreviousRound', () => {
  it('detects words older than the current round window', () => {
    const timerEndsAt = 1_000_000;
    const session = playingSession(timerEndsAt);
    const roundStart = roundStartMsFromSession(session)!;
    const words = new Map([['тест', word(roundStart - 60_000)]]);
    expect(wordsAreFromPreviousRound(session, words)).toBe(true);
  });

  it('ignores words from the current round (first submit race)', () => {
    const timerEndsAt = 1_000_000;
    const session = playingSession(timerEndsAt);
    const roundStart = roundStartMsFromSession(session)!;
    const words = new Map([['тест', word(roundStart + 1000)]]);
    expect(wordsAreFromPreviousRound(session, words)).toBe(false);
  });

  it('returns false for an empty map', () => {
    expect(wordsAreFromPreviousRound(playingSession(1), new Map())).toBe(false);
  });
});
