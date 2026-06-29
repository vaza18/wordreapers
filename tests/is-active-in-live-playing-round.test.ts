import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { isActiveLivePlayer } from '../lib/online/live-round-membership.js';

function session(overrides: Partial<GameSession>): GameSession {
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
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p1: { name: 'One', wordCount: 0, score: 0, online: false },
    },
    ...overrides,
  };
}

describe('isActiveLivePlayer', () => {
  it('requires playing status and online presence', () => {
    expect(isActiveLivePlayer(session({}), 'org')).toBe(true);
    expect(isActiveLivePlayer(session({}), 'p1')).toBe(false);
    expect(isActiveLivePlayer(session({ status: 'finished' }), 'org')).toBe(false);
    expect(isActiveLivePlayer(null, 'org')).toBe(false);
  });

  it('excludes players who voluntarily left (offline with hasLeft)', () => {
    expect(
      isActiveLivePlayer(
        session({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
          },
        }),
        'org',
      ),
    ).toBe(false);
  });

  it('includes stale hasLeft when player is still online', () => {
    expect(
      isActiveLivePlayer(
        session({
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true, hasLeft: true },
          },
          liveRoundPlayerUids: ['org'],
        }),
        'org',
      ),
    ).toBe(true);
  });

  it('excludes online roster member not in liveRoundPlayerUids', () => {
    expect(
      isActiveLivePlayer(
        session({
          baseWordRound: 2,
          liveRoundPlayerUids: ['org'],
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p3: { name: 'Three', wordCount: 0, score: 0, online: true },
          },
        }),
        'p3',
      ),
    ).toBe(false);
  });
});
