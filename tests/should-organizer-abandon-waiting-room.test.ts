import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { shouldOrganizerAbandonWaitingRoom } from '../lib/online/should-organizer-abandon-waiting-room.js';

function session(
  players: GameSession['players'],
  resultsExitedBy?: Record<string, boolean>,
): GameSession {
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
    players,
    resultsExitedBy,
  };
}

describe('shouldOrganizerAbandonWaitingRoom', () => {
  it('abandons when organizer is alone online', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: false, hasLeft: true },
    });
    expect(shouldOrganizerAbandonWaitingRoom(s, 'org')).toBe(true);
  });

  it('keeps room when another player is online in waiting lobby', () => {
    const s = session({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: true },
    });
    expect(shouldOrganizerAbandonWaitingRoom(s, 'org')).toBe(false);
  });

  it('keeps room when another player opted into rematch', () => {
    const s = session(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
      },
      { p2: true },
    );
    expect(shouldOrganizerAbandonWaitingRoom(s, 'org')).toBe(false);
  });
});
