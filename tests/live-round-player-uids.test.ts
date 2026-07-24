import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  appendLiveRoundPlayerUid,
  isActiveLivePlayer,
  isInLiveRound,
  liveRoundPlayerUidsForRoundStart,
  waitingLobbyOptInUids,
} from '../lib/online/presence/live-round-membership.js';

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
  it('returns only online roster members on round 1', () => {
    expect(
      waitingLobbyOptInUids({
        baseWordRound: 0,
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p2: { name: 'Two', wordCount: 0, score: 0, online: true },
          p3: { name: 'Three', wordCount: 0, score: 0, online: false },
        },
      }),
    ).toEqual(['org', 'p2']);
  });

  it('keeps rematch opted-in peers who locked the screen (online false)', () => {
    expect(
      waitingLobbyOptInUids({
        baseWordRound: 2,
        baseWord: 'сівка',
        baseWordChosenBy: 'org',
        resultsExitedBy: { org: true, p2: true },
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: true },
          p2: { name: 'Two', wordCount: 0, score: 0, online: false },
          p3: { name: 'Three', wordCount: 0, score: 0, online: false },
        },
      }),
    ).toEqual(['org', 'p2']);
  });

  it('keeps the assigned picker seat while offline before word commit', () => {
    expect(
      waitingLobbyOptInUids({
        baseWordRound: 2,
        baseWord: '',
        baseWordChosenBy: null,
        baseWordPickerUid: 'org',
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, online: false },
          p2: { name: 'Two', wordCount: 0, score: 0, online: true },
        },
      }),
    ).toEqual(['org', 'p2']);
  });
});

describe('liveRoundPlayerUidsForRoundStart', () => {
  it('always includes the round starter even if briefly offline', () => {
    expect(
      liveRoundPlayerUidsForRoundStart(
        {
          baseWordRound: 2,
          resultsExitedBy: { org: true },
          players: {
            org: { name: 'Org', wordCount: 0, score: 0, online: false },
            p2: { name: 'Two', wordCount: 0, score: 0, online: false },
          },
        },
        'org',
      ),
    ).toEqual(['org']);
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
