import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { votingPlayerIds } from '../lib/online/voting-player-ids.js';

function session(players: GameSession['players']): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
  };
}

describe('votingPlayerIds', () => {
  it('during playing includes only live-round participants', () => {
    const ids = votingPlayerIds(
      session({
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
    );
    expect(ids).toEqual(['a']);
  });

  it('includes active and offline players when not playing', () => {
    const ids = votingPlayerIds({
      ...session({
        a: { name: 'A', wordCount: 0, score: 0, online: true },
        b: { name: 'B', wordCount: 0, score: 0, online: false },
      }),
      status: 'waiting',
      timerEndsAt: null,
    });
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('excludes players who left voluntarily when not playing', () => {
    const ids = votingPlayerIds({
      ...session({
        a: { name: 'A', wordCount: 0, score: 0 },
        b: { name: 'B', wordCount: 0, score: 0, hasLeft: true },
      }),
      status: 'waiting',
      timerEndsAt: null,
    });
    expect(ids).toEqual(['a']);
  });
});
