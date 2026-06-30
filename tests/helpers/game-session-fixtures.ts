import type { GameSession } from '../../lib/firebase/types.js';

/** Default uk session settings for most unit tests. */
export const DEFAULT_SESSION_SETTINGS: GameSession['settings'] = {
  durationSeconds: 300,
  uniqueBonusEnabled: false,
  language: 'uk',
  allowProperNouns: false,
  allowSlang: false,
};

/** Public lobby / uk-uk locale settings (10 min, proper nouns and slang on). */
export const PUBLIC_LOBBY_SESSION_SETTINGS: GameSession['settings'] = {
  durationSeconds: 600,
  uniqueBonusEnabled: false,
  language: 'uk-uk',
  allowProperNouns: true,
  allowSlang: true,
};

/** Organizer plus one guest — common post-join / lobby roster. */
export const ORG_AND_GUEST_PLAYERS: GameSession['players'] = {
  org: { name: 'Org', wordCount: 0, score: 0 },
  a: { name: 'A', wordCount: 0, score: 0 },
};

/** Minimal playing session for live-round membership tests. */
export function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players,
    ...extra,
  };
}

/** Waiting lobby session (public-lobby defaults; override freely). */
export function waitingSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'портрет',
    status: 'waiting',
    settings: PUBLIC_LOBBY_SESSION_SETTINGS,
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, avatarColorIndex: 0 },
    },
    ...overrides,
  };
}

/** Waiting session with an explicit player roster (post-join / route tests). */
export function sessionWithPlayers(
  players: GameSession['players'] = ORG_AND_GUEST_PLAYERS,
  overrides: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тестове',
    status: 'waiting',
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: null,
    organizerId: 'org',
    players,
    ...overrides,
  };
}

/** Minimal session with arbitrary status and overrides. */
export function gameSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: DEFAULT_SESSION_SETTINGS,
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
    settings: DEFAULT_SESSION_SETTINGS,
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
    settings: DEFAULT_SESSION_SETTINGS,
    timerEndsAt: null,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
    },
  };
}
