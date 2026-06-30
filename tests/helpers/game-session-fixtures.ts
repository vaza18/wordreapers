import type { GameSession } from '../../lib/firebase/types.js';

const DEFAULT_SETTINGS: GameSession['settings'] = {
  durationSeconds: 300,
  uniqueBonusEnabled: false,
  language: 'uk',
  allowProperNouns: false,
  allowSlang: false,
};

/** Minimal playing session for live-round membership tests. */
export function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SETTINGS,
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    baseWordRound: 2,
    liveRoundPlayerUids: ['org', 'p2'],
    players,
    ...extra,
  };
}

/** Minimal session with arbitrary status and overrides. */
export function gameSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SETTINGS,
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p1: { name: 'One', wordCount: 0, score: 0, online: false },
    },
    ...overrides,
  };
}

/** Finished session for rematch / opt-in tests. */
export function finishedSession(resultsExitedBy?: Record<string, boolean>): GameSession {
  return {
    baseWord: 'тест',
    status: 'finished',
    baseWordRound: 0,
    settings: DEFAULT_SETTINGS,
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 3, score: 3, online: true },
      p2: { name: 'Two', wordCount: 2, score: 2, online: true },
      p3: { name: 'Three', wordCount: 1, score: 1, online: true },
    },
    resultsExitedBy,
  };
}

/** Session with explicit status and baseWordRound for archive-view tests. */
export function sessionWithRound(
  status: GameSession['status'],
  baseWordRound: number,
): GameSession {
  return {
    baseWord: 'тест',
    status,
    baseWordRound,
    settings: DEFAULT_SETTINGS,
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
  };
}
