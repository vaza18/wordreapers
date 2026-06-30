import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  isLobbyVisiblePlayer,
  isRematchWaitingLobby,
  isRematchWaitingLobbyOptedIn,
} from '../lib/online/rematch-waiting-lobby.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: '',
    status: 'waiting',
    timerEndsAt: null,
    organizerId: 'org',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: false },
      p3: { name: 'Three', wordCount: 0, score: 0, online: false },
    },
    baseWordRound: 1,
    ...overrides,
  };
}

describe('isRematchWaitingLobby', () => {
  it('is true only for waiting round 2+', () => {
    expect(isRematchWaitingLobby(session({ baseWordRound: 0 }))).toBe(false);
    expect(isRematchWaitingLobby(session({ baseWordRound: 1 }))).toBe(true);
    expect(isRematchWaitingLobby(session({ status: 'finished', baseWordRound: 1 }))).toBe(false);
  });
});

describe('isLobbyVisiblePlayer', () => {
  it('shows every rostered player in the first-round waiting lobby', () => {
    const s = session({ baseWordRound: 0 });
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p3')).toBe(true);
  });

  it('shows only opt-in participants during rematch waiting', () => {
    const s = session();
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(false);
    expect(isLobbyVisiblePlayer(s, 'p3')).toBe(false);
  });

  it('treats resultsExitedBy as opt-in before online presence settles', () => {
    const s = session({ resultsExitedBy: { p2: true } });
    expect(isRematchWaitingLobbyOptedIn(s, 'p2')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
  });
});
