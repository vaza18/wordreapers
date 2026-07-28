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
  it('keeps word when chooser goes offline (seat may move; word stays)', () => {
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

  it('keeps early rematcher word when scheduled peer opts in (they may change or start)', () => {
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
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(false);
  });

  it('keeps word when chooser voluntarily left (next picker may start or change)', () => {
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
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(false);
  });

  it('clears word only when chooser uid is missing from the roster', () => {
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'gone',
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(shouldClearLobbyBaseWordForPicker(s)).toBe(true);
  });

  it('does not clear when there is no committed word', () => {
    expect(shouldClearLobbyBaseWordForPicker(session({ baseWordRound: 1 }))).toBe(false);
  });
});
