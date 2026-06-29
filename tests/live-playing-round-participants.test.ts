import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import { isLiveParticipant, liveParticipantIds } from '../lib/online/live-round-membership.js';

function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    baseWordRound: 1,
    liveRoundPlayerUids: ['org', 'p2'],
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
    ...extra,
  };
}

describe('isLiveParticipant', () => {
  it('includes online active players', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: true },
    });
    expect(isLiveParticipant(session, 'p2')).toBe(true);
  });

  it('excludes offline roster members with cleared counters (no opt-in)', () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
      { liveRoundPlayerUids: ['org'] },
    );
    expect(isLiveParticipant(session, 'p3')).toBe(false);
    expect(liveParticipantIds(session).sort()).toEqual(['org']);
  });

  it('excludes prior-round stale counters when not in liveRoundPlayerUids', () => {
    const session = playingSession(
      {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 8, score: 8, online: false },
      },
      { liveRoundPlayerUids: ['org'] },
    );
    expect(isLiveParticipant(session, 'p3')).toBe(false);
  });

  it('includes offline same-round reconnect when counters show activity', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 2, score: 2, online: false },
    });
    expect(isLiveParticipant(session, 'p2')).toBe(true);
  });

  it('includes offline late joiner already in liveRoundPlayerUids', () => {
    const session = playingSession({
      org: { name: 'Org', wordCount: 0, score: 0, online: true },
      p2: { name: 'Two', wordCount: 0, score: 0, online: false },
    });
    expect(isLiveParticipant(session, 'p2')).toBe(true);
  });
});
