import { describe, expect, it } from 'vitest';

import { playerForRoundStart } from '../lib/online/player-for-round-start.js';

describe('playerForRoundStart', () => {
  it('resets scores and clears hasLeft without forcing online', () => {
    expect(
      playerForRoundStart({
        name: 'Guest',
        wordCount: 8,
        score: 12,
        online: false,
        hasLeft: true,
      }),
    ).toEqual({
      name: 'Guest',
      wordCount: 0,
      score: 0,
      online: false,
      hasLeft: false,
    });
  });

  it('keeps online players ready for the round', () => {
    expect(
      playerForRoundStart({
        name: 'Host',
        wordCount: 3,
        score: 5,
        online: true,
      }),
    ).toEqual({
      name: 'Host',
      wordCount: 0,
      score: 0,
      online: true,
      hasLeft: false,
    });
  });
});
