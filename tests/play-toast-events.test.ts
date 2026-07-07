import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { detectPlayToastEvents, detectRankEvents } from '../lib/online/play-toast-events.js';

function session(
  players: GameSession['players'],
  status: GameSession['status'] = 'playing',
  settings?: Partial<GameSession['settings']>,
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status,
    settings: {
      durationSeconds: 300,
      uniqueBonusMode: 'off',
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
      ...settings,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
    ...extra,
  };
}

/** Three or more players with auto x2 — rank/score toasts are enabled. */
function scoringSession(
  players: GameSession['players'],
  status: GameSession['status'] = 'playing',
): GameSession {
  return session(players, status, { uniqueBonusMode: 'auto' });
}

describe('detectPlayToastEvents', () => {
  it('detects a new player joining with inviter attribution', () => {
    const prev = session({
      org: { name: 'Бабуся', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      org: { name: 'Бабуся', wordCount: 0, score: 0, online: true },
      mom: {
        name: 'Мама',
        gender: 'f',
        wordCount: 0,
        score: 0,
        online: true,
        invitedBy: 'org',
      },
    });

    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([]);

    expect(detectPlayToastEvents(prev, curr, 'other')).toEqual([
      {
        type: 'player_joined',
        playerId: 'mom',
        name: 'Мама',
        gender: 'f',
        inviterName: 'Бабуся',
      },
    ]);
  });

  it('detects a player leaving with rank', () => {
    const prev = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: { name: 'Єгор', gender: 'm', wordCount: 1, score: 1, online: true },
    });
    const curr = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Єгор',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: false,
        hasLeft: true,
      },
    });

    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([
      {
        type: 'player_left',
        playerId: 'a',
        name: 'Єгор',
        gender: 'm',
        rank: 2,
      },
      { type: 'alone_in_game' },
    ]);
  });

  it('detects a player rejoining after leaving the round', () => {
    const prev = session(
      {
        org: { name: 'Org', wordCount: 2, score: 3, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['org', 'a'] },
    );
    const curr = session(
      {
        org: { name: 'Org', wordCount: 2, score: 3, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: true,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['org', 'a'] },
    );

    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([
      {
        type: 'player_joined',
        playerId: 'a',
        name: 'Василь',
        gender: 'm',
      },
    ]);
  });

  it('detects rejoin when only online flips before hasLeft is cleared in RTDB', () => {
    const liveRound = { baseWordRound: 1, liveRoundPlayerUids: ['org', 'a'] as string[] };
    const prev = session(
      {
        org: { name: 'Org', wordCount: 2, score: 3, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 1,
          score: 1,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );
    const curr = session(
      {
        org: { name: 'Org', wordCount: 2, score: 3, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 1,
          score: 1,
          online: true,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(
      detectPlayToastEvents(prev, curr, 'org').filter((event) => event.type === 'player_joined'),
    ).toEqual([
      {
        type: 'player_joined',
        playerId: 'a',
        name: 'Василь',
        gender: 'm',
      },
    ]);
  });

  it('detects overtakes when rejoined player still has stale hasLeft in RTDB', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: true,
        hasLeft: true,
      },
      b: { name: 'Б', wordCount: 0, score: 0, online: true },
    });
    const curr = scoringSession({
      me: { name: 'Я', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 2,
        score: 4,
        online: true,
        hasLeft: true,
      },
      b: { name: 'Б', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'a',
        name: 'Василь',
        gender: 'm',
      },
    ]);
  });

  it('detects when viewer is alone in the round', () => {
    const prev = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      a: { name: 'A', wordCount: 0, score: 0, online: false, hasLeft: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([
      {
        type: 'player_left',
        playerId: 'a',
        name: 'A',
        gender: null,
        rank: 1,
      },
      { type: 'alone_in_game' },
    ]);
  });

  it('does not toast alone when another live-round participant is briefly offline', () => {
    const prev = session(
      {
        p1: { name: 'iPad', gender: 'm', wordCount: 0, score: 0, online: true },
        p2: { name: 'Василь', gender: 'm', wordCount: 0, score: 0, online: true },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1', 'p2'] },
    );
    const curr = session(
      {
        p1: { name: 'iPad', gender: 'm', wordCount: 0, score: 0, online: true },
        p2: { name: 'Василь', gender: 'm', wordCount: 0, score: 0, online: false },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1', 'p2'] },
    );

    expect(detectPlayToastEvents(prev, curr, 'p1')).toEqual([]);
  });

  it('does not toast alone at round 1 start when lobby opponent is briefly offline', () => {
    const liveRound = {
      baseWordRound: 0,
      liveRoundPlayerUids: ['org', 'guest'] as string[],
    };
    const bothOnline = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: true },
      },
      'playing',
      undefined,
      liveRound,
    );
    const guestOffline = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: false },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(detectPlayToastEvents(bothOnline, guestOffline, 'org')).toEqual([]);
    expect(detectPlayToastEvents(guestOffline, bothOnline, 'guest')).toEqual([]);
  });

  it('toasts alone again when a rejoined opponent leaves a second time', () => {
    const liveRound = { baseWordRound: 0, liveRoundPlayerUids: ['org', 'guest'] as string[] };
    const bothPlaying = session(
      {
        org: { name: 'Org', wordCount: 2, score: 4, online: true },
        guest: {
          name: 'Guest',
          gender: 'm',
          wordCount: 1,
          score: 2,
          online: true,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      liveRound,
    );
    const guestLeftAgain = session(
      {
        org: { name: 'Org', wordCount: 2, score: 4, online: true },
        guest: {
          name: 'Guest',
          gender: 'm',
          wordCount: 1,
          score: 2,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(detectPlayToastEvents(bothPlaying, guestLeftAgain, 'org')).toEqual([
      {
        type: 'player_left',
        playerId: 'guest',
        name: 'Guest',
        gender: 'm',
        rank: 2,
      },
      { type: 'alone_in_game' },
    ]);
  });

  it('toasts alone when rejoined opponent was online but not counted as active live player', () => {
    const liveRound = { baseWordRound: 2, liveRoundPlayerUids: ['org'] as string[] };
    const guestRejoined = session(
      {
        org: { name: 'Org', wordCount: 1, score: 2, online: true },
        guest: {
          name: 'Guest',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: true,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      liveRound,
    );
    const guestLeftAgain = session(
      {
        org: { name: 'Org', wordCount: 1, score: 2, online: true },
        guest: {
          name: 'Guest',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(detectPlayToastEvents(guestRejoined, guestLeftAgain, 'org')).toEqual([
      {
        type: 'player_left',
        playerId: 'guest',
        name: 'Guest',
        gender: 'm',
        rank: 2,
      },
      { type: 'alone_in_game' },
    ]);
  });

  it('detects overtakes after a tied start', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 0, score: 0, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const curr = scoringSession({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 2, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'bab',
        name: 'Бабуся',
        gender: 'f',
      },
    ]);

    expect(detectPlayToastEvents(prev, curr, 'bab')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'me',
        name: 'Я',
        gender: null,
      },
      {
        type: 'yielded_to_me',
        playerId: 'c',
        name: 'С',
        gender: null,
      },
    ]);
  });

  it('detects yielding the lead after scoring from a tie', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 0, score: 0, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const curr = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 0, score: 0, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'egor',
        name: 'Єгор',
        gender: 'm',
      },
      {
        type: 'yielded_to_me',
        playerId: 'c',
        name: 'С',
        gender: null,
      },
    ]);
  });

  it('detects rank overtakes in both directions', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 1, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 0, score: 0, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const curr = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 1, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 2, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'bab',
        name: 'Бабуся',
        gender: 'f',
      },
    ]);

    const passedPrev = scoringSession({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 1, score: 1, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const passedCurr = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 1, score: 1, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(passedPrev, passedCurr, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'dad',
        name: 'Тато',
        gender: 'm',
      },
      {
        type: 'yielded_to_me',
        playerId: 'c',
        name: 'С',
        gender: null,
      },
    ]);
  });

  it('detects yielding when opponent loses points and viewer takes the lead', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 2, score: 3, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const curr = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 2, score: 1, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'egor',
        name: 'Єгор',
        gender: 'm',
      },
    ]);
  });

  it('does not toast on score ties', () => {
    const catchUpPrev = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 5, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 2, score: 6, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const catchUpCurr = scoringSession({
      me: { name: 'Я', wordCount: 2, score: 6, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 2, score: 6, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(catchUpPrev, catchUpCurr, 'me')).toEqual([]);

    const wordOnlyPrev = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 4, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 4, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });
    const wordOnlyCurr = scoringSession({
      me: { name: 'Я', wordCount: 1, score: 4, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 2, score: 4, online: true },
      c: { name: 'С', wordCount: 0, score: 0, online: true },
    });

    expect(detectPlayToastEvents(wordOnlyPrev, wordOnlyCurr, 'me')).toEqual([]);
  });

  it('detects overtakes from word maps before player nodes catch up', () => {
    const prev = scoringSession({
      me: { name: 'Я', wordCount: 3, score: 3, online: true },
      opp: { name: 'Суперник', gender: 'm', wordCount: 3, score: 3, online: true },
    });
    const curr: GameSession = {
      ...scoringSession({
        me: { name: 'Я', wordCount: 3, score: 3, online: true },
        opp: { name: 'Суперник', gender: 'm', wordCount: 3, score: 3, online: true },
      }),
      wordPlayers: {
        a: { me: true },
        b: { me: true },
        c: { me: true },
        d: { opp: true },
        e: { opp: true },
        g: { opp: true },
        h: { opp: true },
      },
    };

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'opp',
        name: 'Суперник',
        gender: 'm',
      },
    ]);
  });

  it('uses word count for rank toasts when unique bonus is off', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 1, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'bab',
        name: 'Бабуся',
        gender: 'f',
      },
    ]);
  });

  it('does not treat first word with stale hasLeft as player_joined when not in live round', () => {
    const liveRound = { baseWordRound: 1, liveRoundPlayerUids: ['org'] as string[] };
    const prev = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 2,
          score: 4,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );
    const curr = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 2,
          score: 4,
          online: true,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(
      detectPlayToastEvents(prev, curr, 'org').filter((event) => event.type === 'player_joined'),
    ).toEqual([]);
  });

  it('suppresses join toasts when non-participant clears hasLeft offline', () => {
    const liveRound = { baseWordRound: 1, liveRoundPlayerUids: ['org'] as string[] };
    const prev = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      liveRound,
    );
    const curr = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: {
          name: 'Василь',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(
      detectPlayToastEvents(prev, curr, 'org').filter((event) => event.type === 'player_joined'),
    ).toEqual([]);
  });

  it('does not toast join when non-participant clears hasLeft on prior-round results', () => {
    const prev = session(
      {
        p1: { name: 'iPad', gender: 'm', wordCount: 0, score: 0, online: true },
        p3: {
          name: 'Василь 7',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: true,
        },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1', 'org'] },
    );
    const curr = session(
      {
        p1: { name: 'iPad', gender: 'm', wordCount: 0, score: 0, online: true },
        p3: {
          name: 'Василь 7',
          gender: 'm',
          wordCount: 0,
          score: 0,
          online: false,
          hasLeft: false,
        },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1', 'org'] },
    );

    expect(detectPlayToastEvents(prev, curr, 'p1')).toEqual([]);
  });

  it('detects late organizer join instead of alone when stale non-participant drops off', () => {
    const prev = session(
      {
        p1: { name: 'iPad 13 Pro', gender: 'm', wordCount: 0, score: 0, online: true },
        org: { name: 'Василь', gender: 'm', wordCount: 0, score: 0, online: false },
        p3: { name: 'Василь 7', gender: 'm', wordCount: 8, score: 8, online: false },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1'] },
    );
    const curr = session(
      {
        p1: { name: 'iPad 13 Pro', gender: 'm', wordCount: 0, score: 0, online: true },
        org: { name: 'Василь', gender: 'm', wordCount: 0, score: 0, online: true },
        p3: { name: 'Василь 7', gender: 'm', wordCount: 0, score: 0, online: false },
      },
      'playing',
      undefined,
      { baseWordRound: 1, liveRoundPlayerUids: ['p1', 'org'] },
    );

    expect(detectPlayToastEvents(prev, curr, 'p1')).toEqual([
      {
        type: 'player_joined',
        playerId: 'org',
        name: 'Василь',
        gender: 'm',
      },
    ]);
  });

  it('returns nothing outside playing status', () => {
    const prev = session({ org: { name: 'Org', wordCount: 0, score: 0, online: true } });
    const curr = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        a: { name: 'A', wordCount: 0, score: 0, online: true },
      },
      'waiting',
    );
    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([]);
  });

  it('suppresses join toasts when offline viewers not in the active round', () => {
    const prev = scoringSession({
      p1: { name: 'One', wordCount: 1, score: 1, online: true },
      p2: { name: 'Two', wordCount: 1, score: 1, online: true },
      p3: { name: 'Three', wordCount: 0, score: 0, online: false },
    });
    const curr = scoringSession({
      p1: { name: 'One', wordCount: 2, score: 2, online: true },
      p2: { name: 'Two', wordCount: 1, score: 1, online: true },
      p3: { name: 'Three', wordCount: 0, score: 0, online: false },
    });

    expect(detectPlayToastEvents(prev, curr, 'p3')).toEqual([]);
  });

  it('does not toast lobby participants when presence syncs at round start', () => {
    const liveRound = { baseWordRound: 1, liveRoundPlayerUids: ['org', 'guest'] as string[] };
    const bootstrap = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: true },
      },
      'playing',
      undefined,
      liveRound,
    );
    const guestOffline = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: false },
      },
      'playing',
      undefined,
      liveRound,
    );
    const guestOnlineAgain = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: true },
      },
      'playing',
      undefined,
      liveRound,
    );

    expect(detectPlayToastEvents(bootstrap, guestOffline, 'org')).toEqual([]);
    expect(detectPlayToastEvents(guestOffline, guestOnlineAgain, 'org')).toEqual([]);
    expect(detectPlayToastEvents(bootstrap, guestOnlineAgain, 'org')).toEqual([]);
  });

  it('does not duplicate join toasts when the same lobby participant flips online twice', () => {
    const liveRound = { baseWordRound: 0, liveRoundPlayerUids: ['org', 'guest'] as string[] };
    const offline = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: false },
      },
      'playing',
      undefined,
      liveRound,
    );
    const online = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        guest: { name: 'Guest', gender: 'm', wordCount: 0, score: 0, online: true },
      },
      'playing',
      undefined,
      liveRound,
    );

    const joinToasts = (prev: GameSession, curr: GameSession) =>
      detectPlayToastEvents(prev, curr, 'org').filter((event) => event.type === 'player_joined');

    expect(joinToasts(offline, online)).toEqual([]);
    expect(joinToasts(online, offline)).toEqual([]);
    expect(joinToasts(offline, online)).toEqual([]);
  });

  it('emits one net rank toast when split score updates cross and recross', () => {
    const baseline = scoringSession({
      me: { name: 'Я', wordCount: 3, score: 6, online: true },
      opp: { name: 'Суперник', gender: 'm', wordCount: 3, score: 6, online: true },
    });
    const oppScored = scoringSession({
      me: { name: 'Я', wordCount: 3, score: 6, online: true },
      opp: { name: 'Суперник', gender: 'm', wordCount: 4, score: 8, online: true },
    });
    const meScored = scoringSession({
      me: { name: 'Я', wordCount: 5, score: 10, online: true },
      opp: { name: 'Суперник', gender: 'm', wordCount: 4, score: 8, online: true },
    });

    expect(detectRankEvents(baseline, oppScored, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'opp',
        name: 'Суперник',
        gender: 'm',
      },
    ]);
    expect(detectRankEvents(oppScored, meScored, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'opp',
        name: 'Суперник',
        gender: 'm',
      },
    ]);
    expect(detectRankEvents(baseline, meScored, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'opp',
        name: 'Суперник',
        gender: 'm',
      },
    ]);
  });
});
