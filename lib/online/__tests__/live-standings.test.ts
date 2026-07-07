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
  it('applies x2 from word maps when roster has 3+ players in round 1', () => {
    const s = session({
      players: {
        org: { name: 'Орг', score: 3, wordCount: 3, avatarColorIndex: 0, online: true },
        a: { name: 'А', score: 1, wordCount: 1, avatarColorIndex: 1, online: true },
        b: { name: 'Б', score: 0, wordCount: 0, avatarColorIndex: 2, online: true },
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

  it('excludes non-opt-in roster members from rematch round standings and x2', () => {
    const s = session({
      baseWordRound: 1,
      liveRoundPlayerUids: ['org', 'a'],
      players: {
        org: { name: 'Орг', score: 0, wordCount: 0, avatarColorIndex: 0, online: true },
        a: { name: 'А', score: 0, wordCount: 0, avatarColorIndex: 1, online: true },
        b: {
          name: 'Б',
          score: 12,
          wordCount: 12,
          avatarColorIndex: 2,
          online: false,
        },
      },
      wordPlayers: {
        жар: { org: true },
      },
    });

    const standings = buildLiveStandingsFromSession(s);
    expect(standings.map((row) => row.playerId).sort()).toEqual(['a', 'org']);
    expect(standings.find((row) => row.playerId === 'org')?.score).toBe(1);
  });
});
