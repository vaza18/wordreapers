import { describe, expect, it } from 'vitest';

import { resolvePostJoinRoute } from '../lib/online/post-join-route.js';
import { sessionWithPlayers } from './helpers/game-session-fixtures.js';

describe('resolvePostJoinRoute', () => {
  it('routes active rounds to play', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: true },
          },
          {
            status: 'playing',
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes passive roster members on an active round to results', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: false },
          },
          {
            status: 'playing',
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/results/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes round 2+ mid-round invite joiner in liveRoundPlayerUids to play', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            joiner: { name: 'New', wordCount: 0, score: 0, online: true },
          },
          {
            status: 'playing',
            baseWordRound: 1,
            liveRoundPlayerUids: ['org', 'joiner'],
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'joiner',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes round 2+ roster member not in liveRoundPlayerUids to results', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            joiner: { name: 'New', wordCount: 0, score: 0, online: true },
          },
          {
            status: 'playing',
            baseWordRound: 1,
            liveRoundPlayerUids: ['org'],
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'joiner',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/results/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes rejoin after voluntary leave to play', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 1, score: 2 },
            a: { name: 'A', wordCount: 0, score: 0, hasLeft: false, online: true },
          },
          {
            status: 'playing',
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
  });

  it('routes finished rounds to results', () => {
    expect(
      resolvePostJoinRoute(sessionWithPlayers(undefined, { status: 'finished' }), 'a', 'AB12'),
    ).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'AB12' },
    });
  });
});
