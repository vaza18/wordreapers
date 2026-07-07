import { describe, expect, it } from 'vitest';

import { resolveRematchNavigationRoute } from '../lib/online/rematch/resolve-rematch-navigation-route.js';

describe('resolveRematchNavigationRoute', () => {
  it('routes to play when the live round already started', () => {
    expect(resolveRematchNavigationRoute('playing', 'ABCDE')).toEqual({
      pathname: '/online/play/[gameId]',
      params: { gameId: 'ABCDE' },
    });
  });

  it('routes to lobby for waiting or finished sessions', () => {
    expect(resolveRematchNavigationRoute('waiting', 'ABCDE')).toEqual({
      pathname: '/online/lobby/[gameId]',
      params: { gameId: 'ABCDE' },
    });
    expect(resolveRematchNavigationRoute('finished', 'ABCDE')).toEqual({
      pathname: '/online/lobby/[gameId]',
      params: { gameId: 'ABCDE' },
    });
  });
});
