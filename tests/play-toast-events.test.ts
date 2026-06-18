import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { detectPlayToastEvents } from '../lib/online/play-toast-events.js';

function session(
  players: GameSession['players'],
  status: GameSession['status'] = 'playing',
): GameSession {
  return {
    baseWord: 'тест',
    status,
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
  };
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
    const prev = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: false,
        hasLeft: true,
      },
    });
    const curr = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: true,
        hasLeft: false,
      },
    });

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
    const prev = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: false,
        hasLeft: true,
      },
    });
    const curr = session({
      org: { name: 'Org', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: true,
        hasLeft: true,
      },
    });

    expect(detectPlayToastEvents(prev, curr, 'org')).toEqual([
      {
        type: 'player_joined',
        playerId: 'a',
        name: 'Василь',
        gender: 'm',
      },
    ]);
  });

  it('detects overtakes when rejoined player still has stale hasLeft in RTDB', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 1,
        score: 1,
        online: true,
        hasLeft: true,
      },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 2, score: 3, online: true },
      a: {
        name: 'Василь',
        gender: 'm',
        wordCount: 2,
        score: 4,
        online: true,
        hasLeft: true,
      },
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

  it('detects overtakes after a tied start', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 2, online: true },
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
    ]);
  });

  it('detects yielding the lead after scoring from a tie', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 0, score: 0, online: true },
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

  it('detects rank overtakes in both directions', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 1, score: 1, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 0, score: 0, online: true },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 1, score: 1, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 2, online: true },
    });

    expect(detectPlayToastEvents(prev, curr, 'me')).toEqual([
      {
        type: 'overtook_me',
        playerId: 'bab',
        name: 'Бабуся',
        gender: 'f',
      },
    ]);

    const passedPrev = session({
      me: { name: 'Я', wordCount: 0, score: 0, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 1, score: 1, online: true },
    });
    const passedCurr = session({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 1, score: 1, online: true },
    });

    expect(detectPlayToastEvents(passedPrev, passedCurr, 'me')).toEqual([
      {
        type: 'yielded_to_me',
        playerId: 'dad',
        name: 'Тато',
        gender: 'm',
      },
    ]);
  });

  it('detects yielding when opponent loses points and viewer takes the lead', () => {
    const prev = session({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 2, score: 3, online: true },
    });
    const curr = session({
      me: { name: 'Я', wordCount: 1, score: 2, online: true },
      egor: { name: 'Єгор', gender: 'm', wordCount: 2, score: 1, online: true },
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
    const catchUpPrev = session({
      me: { name: 'Я', wordCount: 1, score: 5, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 2, score: 6, online: true },
    });
    const catchUpCurr = session({
      me: { name: 'Я', wordCount: 2, score: 6, online: true },
      dad: { name: 'Тато', gender: 'm', wordCount: 2, score: 6, online: true },
    });

    expect(detectPlayToastEvents(catchUpPrev, catchUpCurr, 'me')).toEqual([]);

    const wordOnlyPrev = session({
      me: { name: 'Я', wordCount: 1, score: 4, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 1, score: 4, online: true },
    });
    const wordOnlyCurr = session({
      me: { name: 'Я', wordCount: 1, score: 4, online: true },
      bab: { name: 'Бабуся', gender: 'f', wordCount: 2, score: 4, online: true },
    });

    expect(detectPlayToastEvents(wordOnlyPrev, wordOnlyCurr, 'me')).toEqual([]);
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
});
