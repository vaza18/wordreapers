import { beforeEach, describe, expect, it, vi } from 'vitest';

const tryFetchSessionWordMaps = vi.fn();
const getActiveRoundCache = vi.fn();

vi.mock('../lib/firebase/session-word-maps-service.js', () => ({
  tryFetchSessionWordMaps: (...args: unknown[]) => tryFetchSessionWordMaps(...args),
}));

vi.mock('../lib/online/session/active-round-cache.js', () => ({
  getActiveRoundCache: (...args: unknown[]) => getActiveRoundCache(...args),
}));

import { resolvePostJoinRoute } from '../lib/online/post-join-route.js';
import { resolvePostJoinRouteWithMaps } from '../lib/online/post-join-route-with-maps.js';
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

  it('routes round-0 offline player to play when wordPlayers shows they scored', () => {
    expect(
      resolvePostJoinRoute(
        sessionWithPlayers(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            a: { name: 'A', wordCount: 0, score: 0, online: false },
          },
          {
            status: 'playing',
            baseWordRound: 0,
            timerEndsAt: Date.now() + 60_000,
            wordPlayers: { порт: { a: true } },
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

  it('routes rematch joiner to pick-word when first picker set a word then went offline', () => {
    // Offline chooser's word is not sticky — joiner becomes picker and must re-pick after clear,
    // but while the stale word is still on the snapshot, route to lobby (sync clears next).
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
            resultsExitedBy: { org: true, a: true },
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

describe('resolvePostJoinRouteWithMaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveRoundCache.mockResolvedValue(null);
  });

  it('fetches maps when round-0 offline scorer would otherwise go to results', async () => {
    tryFetchSessionWordMaps.mockResolvedValue({
      ok: true,
      maps: { wordPlayers: { порт: { a: true } } },
    });
    const session = sessionWithPlayers(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: false },
      },
      {
        status: 'playing',
        baseWordRound: 0,
        timerEndsAt: Date.now() + 60_000,
      },
    );

    await expect(resolvePostJoinRouteWithMaps(session, 'a', 'AB12')).resolves.toEqual({
      pathname: '/online/play/[gameId]',
      params: { gameId: 'AB12' },
    });
    expect(tryFetchSessionWordMaps).toHaveBeenCalledWith('AB12');
  });

  it('skips maps fetch when already a live participant', async () => {
    const session = sessionWithPlayers(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: true },
      },
      {
        status: 'playing',
        timerEndsAt: Date.now() + 60_000,
      },
    );

    await expect(resolvePostJoinRouteWithMaps(session, 'a', 'AB12')).resolves.toEqual({
      pathname: '/online/play/[gameId]',
      params: { gameId: 'AB12' },
    });
    expect(tryFetchSessionWordMaps).not.toHaveBeenCalled();
  });

  it('routes inactive round-0 to results when maps fail and no local scored cache', async () => {
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    const session = sessionWithPlayers(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: false },
      },
      {
        status: 'playing',
        baseWordRound: 0,
        timerEndsAt: Date.now() + 60_000,
      },
    );

    await expect(resolvePostJoinRouteWithMaps(session, 'a', 'AB12')).resolves.toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'AB12', fromJoin: '1' },
    });
    expect(tryFetchSessionWordMaps).toHaveBeenCalled();
    expect(getActiveRoundCache).toHaveBeenCalled();
  });

  it('routes round-0 offline scorer to play from local cache when maps fail', async () => {
    const timerEndsAt = Date.now() + 60_000;
    tryFetchSessionWordMaps.mockResolvedValue({ ok: false, error: new Error('network') });
    getActiveRoundCache.mockResolvedValue({
      gameId: 'AB12',
      baseWordRound: 0,
      timerEndsAt,
      sessionSnapshot: { wordPlayers: { порт: { a: true } } },
    });
    const session = sessionWithPlayers(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: false },
      },
      {
        status: 'playing',
        baseWordRound: 0,
        timerEndsAt,
      },
    );

    await expect(resolvePostJoinRouteWithMaps(session, 'a', 'AB12')).resolves.toEqual({
      pathname: '/online/play/[gameId]',
      params: { gameId: 'AB12' },
    });
  });
});
