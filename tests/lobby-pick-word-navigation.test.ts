import { describe, expect, it } from 'vitest';

import {
  lobbyToPickWordRoute,
  shouldEnablePickWordPresence,
  shouldLeavePickWordScreen,
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

describe('shouldLeavePickWordScreen', () => {
  it('leaves when seat is lost even if the screen would be unfocused (ZF6U4)', () => {
    expect(shouldLeavePickWordScreen({ status: 'waiting' }, false)).toBe(true);
    expect(shouldLeavePickWordScreen({ status: 'waiting' }, true)).toBe(false);
    expect(shouldLeavePickWordScreen({ status: 'playing' }, true)).toBe(true);
  });
});
