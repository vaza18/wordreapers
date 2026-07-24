import { describe, expect, it } from 'vitest';

import {
  lobbyToPickWordRoute,
  shouldEnablePickWordPresence,
} from '../lib/online/lobby-pick-word-navigation.js';

describe('lobbyToPickWordRoute', () => {
  it('pushes pick-word with fromLobby so lobby presence stays mounted', () => {
    expect(lobbyToPickWordRoute('VJGPD')).toEqual({
      pathname: '/online/pick-word/[gameId]',
      params: { gameId: 'VJGPD', fromLobby: '1' },
    });
  });
});

describe('shouldEnablePickWordPresence', () => {
  it('disables presence when stacked on lobby; enables for direct entry', () => {
    expect(shouldEnablePickWordPresence(true)).toBe(false);
    expect(shouldEnablePickWordPresence(false)).toBe(true);
  });
});
