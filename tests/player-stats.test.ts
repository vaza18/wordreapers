import { describe, expect, it } from 'vitest';

import type { PlayerStandings } from '@/lib/game/scoring';
import { didPlayerWinOnlineRound, normalizeProfilePlayerName } from '@/lib/profile/player-stats';

describe('player stats', () => {
  it('matches profile name case-insensitively', () => {
    expect(normalizeProfilePlayerName('  Василь ')).toBe('василь');
  });

  it('detects online win by firebase uid', () => {
    const standings: PlayerStandings[] = [
      { playerId: 'uid-a', score: 12, wordCount: 6, uniqueCount: 2 },
      { playerId: 'uid-b', score: 9, wordCount: 5, uniqueCount: 1 },
    ];
    expect(didPlayerWinOnlineRound('uid-a', standings)).toBe(true);
    expect(didPlayerWinOnlineRound('uid-b', standings)).toBe(false);
  });
});
