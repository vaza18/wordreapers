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
    ).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'AB12', fromJoin: '1' },
    });
  });

  it('routes round 2+ live-roster member briefly offline to play', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 1, score: 2, online: false, hasLeft: false },
          },
          {
            status: 'playing',
            baseWordRound: 1,
            liveRoundPlayerUids: ['org', 'a'],
            timerEndsAt: Date.now() + 60_000,
          },
        ),
        'a',
        'AB12',
      ),
    ).toEqual({ pathname: '/online/play/[gameId]', params: { gameId: 'AB12' } });
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
    ).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'AB12', fromJoin: '1' },
    });
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

  it('routes rematch joiner to lobby when first picker already set the word but is briefly offline', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
            a: { name: 'A', wordCount: 0, score: 0, online: true },
          },
          {
            status: 'waiting',
            baseWordRound: 4,
            baseWord: 'каландрувальниця',
            baseWordChosenBy: 'org',
            baseWordPickerOrder: ['org', 'a'],
            baseWordPickerUid: 'org',
          },
        ),
        'a',
        'L8NN5',
      ),
    ).toEqual({ pathname: '/online/lobby/[gameId]', params: { gameId: 'L8NN5' } });
  });

  it('routes first rematcher to pick-word when scheduled peer still on results', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: false },
          },
          {
            status: 'waiting',
            baseWord: '',
            baseWordRound: 1,
            baseWordPickerOrder: ['org', 'a'],
            resultsExitedBy: { org: true },
          },
        ),
        'org',
        'QBQ4W',
      ),
    ).toEqual({ pathname: '/online/pick-word/[gameId]', params: { gameId: 'QBQ4W' } });
  });

  it('routes second rematcher to lobby when rightful chooser already set the word', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
            a: { name: 'A', wordCount: 0, score: 0, online: true },
          },
          {
            status: 'waiting',
            baseWord: 'випещеність',
            baseWordChosenBy: 'org',
            baseWordRound: 2,
            baseWordPickerOrder: ['org', 'a'],
            resultsExitedBy: { org: true, a: true },
          },
        ),
        'a',
        'DSSN2',
      ),
    ).toEqual({ pathname: '/online/lobby/[gameId]', params: { gameId: 'DSSN2' } });
  });
});
