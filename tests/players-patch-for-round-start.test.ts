import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  buildPlayersPatchForRoundStart,
  playerPatchForRoundStart,
} from '../lib/online/presence/players-patch-for-round-start.js';

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

  it('fully resets lobby-present players for the round starter', () => {
    expect(
      playerPatchForRoundStart(
        session,
        'p1',
        { name: 'Host', wordCount: 8, score: 12, online: true },
        'p1',
      ),
    ).toEqual({ score: 0, wordCount: 0, hasLeft: false });
  });

  it('omits hasLeft when patching another roster member', () => {
    expect(
      playerPatchForRoundStart(
        session,
        'org',
        { name: 'Host', wordCount: 8, score: 12, online: true },
        'p1',
      ),
    ).toEqual({ score: 0, wordCount: 0 });
  });

  it('clears stale counters for offline roster members without opt-in', () => {
    expect(
      playerPatchForRoundStart(
        session,
        'p3',
        { name: 'Guest', wordCount: 8, score: 12, online: false },
        'p1',
      ),
    ).toEqual({ score: 0, wordCount: 0 });
  });

  it('skips players who already left without opt-in', () => {
    expect(
      playerPatchForRoundStart(
        session,
        'gone',
        { name: 'Gone', wordCount: 1, score: 1, online: false, hasLeft: true },
        'p1',
      ),
    ).toBeNull();
  });

  it('clears stale hasLeft only for the round starter', () => {
    const optedInSession = waitingSession({}, { resultsExitedBy: { org: true } });
    expect(
      playerPatchForRoundStart(
        optedInSession,
        'org',
        { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        'org',
      ),
    ).toEqual({ score: 0, wordCount: 0, hasLeft: false });
    expect(
      playerPatchForRoundStart(
        optedInSession,
        'org',
        { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        'p1',
      ),
    ).toEqual({ score: 0, wordCount: 0 });
  });
});

describe('buildPlayersPatchForRoundStart', () => {
  it('patches every non-left roster member without foreign hasLeft writes', () => {
    const patch = buildPlayersPatchForRoundStart(
      waitingSession({
        org: { name: 'Org', wordCount: 1, score: 1, online: true },
        p2: { name: 'Two', wordCount: 5, score: 5, online: true },
        p3: { name: 'Three', wordCount: 9, score: 9, online: false },
        gone: { name: 'Gone', wordCount: 1, score: 1, hasLeft: true },
      }),
      'p2',
    );
    expect(patch).toEqual({
      org: { score: 0, wordCount: 0 },
      p2: { score: 0, wordCount: 0, hasLeft: false },
      p3: { score: 0, wordCount: 0 },
    });
  });
});
