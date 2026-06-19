import { describe, expect, it } from 'vitest';

import { isSoloStandings } from '../lib/game/solo-round.js';
import type { PlayerStandings } from '../lib/game/scoring.js';

const row = (playerId: string): PlayerStandings => ({
  playerId,
  score: 0,
  wordCount: 0,
  uniqueCount: 0,
});

describe('isSoloStandings', () => {
  it('is true for a single player', () => {
    expect(isSoloStandings([row('solo')])).toBe(true);
  });

  it('is false when opponents are present', () => {
    expect(isSoloStandings([row('a'), row('b')])).toBe(false);
  });
});
