import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types.js';
import {
  formatLiveRosterDetails,
  formatSessionRosterLog,
} from '../lib/debug/format-session-roster-log.js';

function session(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'тест',
    status: 'playing',
    timerEndsAt: null,
    organizerId: 'org-aaaa',
    settings: {
      durationSeconds: 300,
      uniqueBonusEnabled: false,
      language: 'uk',
      allowProperNouns: false,
      allowSlang: false,
    },
    players: {
      'org-aaaa': { name: 'Василь 3', wordCount: 1, score: 1, online: true },
      'guest-bbbb': {
        name: 'Василь 7',
        wordCount: 0,
        score: 0,
        online: false,
        hasLeft: false,
      },
    },
    baseWordRound: 2,
    liveRoundPlayerUids: ['org-aaaa'],
    resultsExitedBy: { 'org-aaaa': true },
    baseWordPickerUid: 'org-aaaa',
    baseWordChosenBy: 'org-aaaa',
    ...overrides,
  };
}

describe('formatSessionRosterLog', () => {
  it('includes online/live/latch/picker/word flags per player', () => {
    const line = formatSessionRosterLog(session());
    expect(line).toContain('Василь3#aaaa[on,live,latch,pick,chose,w1]');
    expect(line).toContain('Василь7#bbbb[off,w0]');
  });

  it('marks left and live override', () => {
    const line = formatSessionRosterLog(
      session({
        players: {
          'org-aaaa': { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        },
        liveRoundPlayerUids: [],
      }),
      { liveUidsOverride: ['org-aaaa'] },
    );
    expect(line).toBe('Org#aaaa[off,left,live,latch,pick,chose,w0]');
  });
});

describe('formatLiveRosterDetails', () => {
  it('prefixes liveUids list', () => {
    expect(formatLiveRosterDetails(session(), ['org-aaaa', 'guest-bbbb'])).toBe(
      'liveUids=[org-aaaa,guest-bbbb] roster=Василь3#aaaa[on,live,latch,pick,chose,w1] Василь7#bbbb[off,live,w0]',
    );
  });
});
