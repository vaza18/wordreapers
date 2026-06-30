import { describe, expect, it } from 'vitest';

import { onlineResultsRoute } from '../lib/online/online-results-route.js';

describe('onlineResultsRoute', () => {
  it('includes baseWordRound when viewing an earlier round', () => {
    expect(onlineResultsRoute('ABCDE', 0)).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'ABCDE', baseWordRound: '0' },
    });
  });

  it('omits baseWordRound when not pinned', () => {
    expect(onlineResultsRoute('ABCDE')).toEqual({
      pathname: '/online/results/[gameId]',
      params: { gameId: 'ABCDE' },
    });
  });
});
