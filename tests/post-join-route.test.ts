import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { resolvePostJoinRoute } from '../lib/online/post-join-route.js';

function session(overrides: Partial<GameSession>): GameSession {
  return {
    baseWord: 'тестове',
    status: 'waiting',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0 },
      a: { name: 'A', wordCount: 0, score: 0 },
    },
    ...overrides,
  };
}

describe('resolvePostJoinRoute', () => {
  it('routes active rounds to play', () => {
    expect(
      resolvePostJoinRoute(
        session({
          status: 'playing',
          timerEndsAt: Date.now() + 60_000,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: true },
          },
        }),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes passive roster members on an active round to results', () => {
    expect(
      resolvePostJoinRoute(
        session({
          status: 'playing',
          timerEndsAt: Date.now() + 60_000,
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: false },
          },
        }),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/results/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes rejoin after voluntary leave to play', () => {
    expect(
      resolvePostJoinRoute(
        session({
          status: 'playing',
          timerEndsAt: Date.now() + 60_000,
          players: {
            org: { name: 'Org', wordCount: 1, score: 2 },
            a: { name: 'A', wordCount: 0, score: 0, hasLeft: false, online: true },
          },
        }),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes finished rounds to results', () => {
    expect(resolvePostJoinRoute(session({ status: 'finished' }), 'a', 'AB12')).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'AB12' },
    });
  });
});
