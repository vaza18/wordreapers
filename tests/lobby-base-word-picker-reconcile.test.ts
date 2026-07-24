import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types';
import { shouldClearLobbyBaseWordForPicker } from '../lib/online/base-word-picker';

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
      p2: { name: 'Two', wordCount: 0, score: 0, online: true },
    },
    baseWordPickerOrder: ['org', 'p2'],
    baseWordRound: 0,
    ...overrides,
  };
}

describe('shouldClearLobbyBaseWordForPicker', () => {
  it('keeps round-3 word when rightful chooser is briefly offline (DSSN2)', () => {
    const s = session({
      baseWordRound: 2,
      baseWord: 'випещеність',
      baseWordChosenBy: 'org',
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(false);
  });

  it('clears early rematcher word when scheduled peer opts in before start', () => {
    const s = session({
      baseWordRound: 1,
      baseWord: 'адонізид',
      baseWordChosenBy: 'org',
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(true);
  });

  it('clears word when chooser voluntarily left even with durable latch (75AGB)', () => {
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'org',
      resultsExitedBy: { org: true, p2: true },
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(true);
  });

  it('does not clear word when chooser is briefly offline with durable latch', () => {
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'org',
      resultsExitedBy: { org: true, p2: true },
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(false);
  });

  it('clears word when chooser truly left without durable rematch seat', () => {
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(true);
  });

  it('does not clear when there is no committed word', () => {
    expect(shouldClearLobbyBaseWordForPicker(session({ baseWordRound: 1 }))).toBe(false);
  });
});
