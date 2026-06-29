import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  buildPlayersPatchForRoundStart,
  playerPatchForRoundStart,
} from '../lib/online/players-patch-for-round-start.js';

function waitingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
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
    players,
    ...extra,
  };
}

describe('playerPatchForRoundStart', () => {
  const session = waitingSession({});

  it('fully resets lobby-present players', () => {
    expect(
      playerPatchForRoundStart(session, 'org', {
        name: 'Host',
        wordCount: 8,
        score: 12,
        online: true,
      }),
    ).toEqual({ score: 0, wordCount: 0, hasLeft: false });
  });

  it('clears stale counters for offline roster members without opt-in', () => {
    expect(
      playerPatchForRoundStart(session, 'p3', {
        name: 'Guest',
        wordCount: 8,
        score: 12,
        online: false,
      }),
    ).toEqual({ score: 0, wordCount: 0, online: false });
  });

  it('skips players who already left without opt-in', () => {
    expect(
      playerPatchForRoundStart(session, 'gone', {
        name: 'Gone',
        wordCount: 1,
        score: 1,
        online: false,
        hasLeft: true,
      }),
    ).toBeNull();
  });

  it('clears stale hasLeft for offline opt-in players', () => {
    const optedInSession = waitingSession({}, { resultsExitedBy: { org: true } });
    expect(
      playerPatchForRoundStart(optedInSession, 'org', {
        name: 'Org',
        wordCount: 0,
        score: 0,
        online: false,
        hasLeft: true,
      }),
    ).toEqual({ score: 0, wordCount: 0, hasLeft: false });
  });
});

describe('buildPlayersPatchForRoundStart', () => {
  it('patches every non-left roster member', () => {
    const patch = buildPlayersPatchForRoundStart(
      waitingSession({
        org: { name: 'Org', wordCount: 1, score: 1, online: true },
        p2: { name: 'Two', wordCount: 5, score: 5, online: true },
        p3: { name: 'Three', wordCount: 9, score: 9, online: false },
        gone: { name: 'Gone', wordCount: 1, score: 1, hasLeft: true },
      }),
    );
    expect(patch).toEqual({
      org: { score: 0, wordCount: 0, hasLeft: false },
      p2: { score: 0, wordCount: 0, hasLeft: false },
      p3: { score: 0, wordCount: 0, online: false },
    });
  });
});
