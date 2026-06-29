import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  appendLiveRoundPlayerUid,
  isActiveLivePlayer,
  isInLiveRound,
  waitingLobbyOptInUids,
} from '../lib/online/live-round-membership.js';

function playingSession(
  players: GameSession['players'],
  extra: Partial<GameSession> = {},
): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    baseWordRound: 2,
    liveRoundPlayerUids: ['org', 'p2'],
    players,
    ...extra,
  };
}

describe('waitingLobbyOptInUids', () => {
  it('returns only online roster members', () => {
    expect(
      waitingLobbyOptInUids({
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p2: { name: 'Two', wordCount: 0, score: 0, online: true },
          p3: { name: 'Three', wordCount: 0, score: 0, online: false },
        },
      }),
    ).toEqual(['org', 'p2']);
  });
});

describe('isInLiveRound', () => {
  it('allows all players in round 1', () => {
    expect(isInLiveRound({ baseWordRound: 0, liveRoundPlayerUids: ['org'] }, 'p3')).toBe(true);
  });

  it('excludes roster members not in liveRoundPlayerUids', () => {
    expect(isInLiveRound({ baseWordRound: 2, liveRoundPlayerUids: ['org', 'p2'] }, 'p3')).toBe(
      false,
    );
  });

  it('returns false when liveRoundPlayerUids is missing for round 2+', () => {
    expect(isInLiveRound({ baseWordRound: 2, liveRoundPlayerUids: null }, 'org')).toBe(false);
    expect(isInLiveRound({ baseWordRound: 2, liveRoundPlayerUids: [] }, 'org')).toBe(false);
  });
});

describe('appendLiveRoundPlayerUid', () => {
  it('appends without duplicates', () => {
    expect(appendLiveRoundPlayerUid(['org'], 'p2')).toEqual(['org', 'p2']);
    expect(appendLiveRoundPlayerUid(['org', 'p2'], 'p2')).toEqual(['org', 'p2']);
  });
});

describe('isActiveLivePlayer with liveRoundPlayerUids', () => {
  it('excludes online player reviewing prior round results (not in liveRoundPlayerUids)', () => {
    expect(
      isActiveLivePlayer(
        playingSession({
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p2: { name: 'Two', wordCount: 0, score: 0, online: true },
          p3: { name: 'Three', wordCount: 0, score: 0, online: true },
        }),
        'p3',
      ),
    ).toBe(false);
  });

  it('includes mid-round rejoin after uid was appended to liveRoundPlayerUids', () => {
    expect(
      isActiveLivePlayer(
        playingSession(
          {
            org: { name: 'Org', wordCount: 0, score: 0, online: true },
            p2: { name: 'Two', wordCount: 0, score: 0, online: true },
            p3: { name: 'Three', wordCount: 0, score: 0, online: true },
          },
          { liveRoundPlayerUids: ['org', 'p2', 'p3'] },
        ),
        'p3',
      ),
    ).toBe(true);
  });
});
