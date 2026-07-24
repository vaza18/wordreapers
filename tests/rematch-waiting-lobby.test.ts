import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  buildRematchOptInLatch,
  isLobbyVisiblePlayer,
  isRematchWaitingLobby,
  isRematchWaitingLobbyOptedIn,
} from '../lib/online/rematch/rematch-waiting-lobby.js';

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

describe('buildRematchOptInLatch', () => {
  it('latches the rematch actor and prior exits', () => {
    expect(buildRematchOptInLatch('org')).toEqual({ org: true });
    expect(buildRematchOptInLatch('org', { guest: true, left: false })).toEqual({
      org: true,
      guest: true,
    });
  });
});

describe('isLobbyVisiblePlayer', () => {
  it('shows every rostered player in the first-round waiting lobby', () => {
    const s = session({ baseWordRound: 0 });
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p3')).toBe(true);
  });

  it('hides voluntarily left players from the waiting lobby', () => {
    const s = session({
      baseWordRound: 0,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
    });
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(false);
  });

  it('hides left players even when presence was resurrected as online', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true, hasLeft: true },
      },
    });
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(false);
  });

  it('keeps stale-hasLeft first rematcher visible via durable latch (JZ4Y5)', () => {
    // Late joiner must still see the organizer who opened the round and may have a
    // stale hasLeft from a leave/rejoin race while latch / word / pickerUid stand.
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'org',
      baseWordPickerUid: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
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

  it('keeps offline rematcher visible via resultsExitedBy latch', () => {
    const s = session({
      resultsExitedBy: { p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    });
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p3')).toBe(false);
  });

  it('keeps the rematch word-chooser visible while briefly offline', () => {
    const s = session({
      baseWord: 'карантинізація',
      baseWordChosenBy: 'org',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(isRematchWaitingLobbyOptedIn(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
  });

  it('keeps the assigned baseWordPickerUid visible while offline without latch/word yet', () => {
    // Rightful first rematcher opened round 3 / is on pick-word; multi-sim marks them
    // offline before the late joiner's lobby snapshot has latch or committed word.
    const s = session({
      baseWordRound: 2,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordPickerUid: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(isRematchWaitingLobbyOptedIn(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'org')).toBe(true);
    expect(isLobbyVisiblePlayer(s, 'p2')).toBe(true);
  });

  it('returns false for unknown roster uids', () => {
    const s = session();
    expect(isRematchWaitingLobbyOptedIn(s, 'missing')).toBe(false);
    expect(isLobbyVisiblePlayer(s, 'missing')).toBe(false);
  });
});
