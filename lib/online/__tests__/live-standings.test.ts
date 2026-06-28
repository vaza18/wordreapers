import { describe, expect, it } from 'vitest';

import type { GameSession } from '../../firebase/types.js';
import {
  buildLiveStandingsFromSession,
  sessionPlayerScoresMatchWordMaps,
} from '../live-standings.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 600,
      uniqueBonusMode: 'auto',
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {},
    ...overrides,
  };
}

describe('buildLiveStandingsFromSession', () => {
  it('applies x2 from word maps when bonus was enabled at round start', () => {
    const s = session({
      settings: {
        durationSeconds: 600,
        uniqueBonusMode: 'auto',
        uniqueBonusEnabled: true,
        language: 'uk-uk',
        allowProperNouns: false,
        allowSlang: false,
      },
      players: {
        org: { name: 'Орг', score: 3, wordCount: 3, avatarColorIndex: 0 },
        a: { name: 'А', score: 1, wordCount: 1, avatarColorIndex: 1 },
        b: { name: 'Б', score: 0, wordCount: 0, avatarColorIndex: 2 },
      },
      wordPlayers: {
        ера: { org: true },
        мор: { org: true },
        фора: { org: true },
      },
    });

    const standings = buildLiveStandingsFromSession(s);
    expect(standings.find((row) => row.playerId === 'org')?.score).toBe(6);
    expect(sessionPlayerScoresMatchWordMaps(s)).toBe(false);
  });
});
