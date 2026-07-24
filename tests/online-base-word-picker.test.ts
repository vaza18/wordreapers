import { describe, expect, it } from 'vitest';

import type { GameSession } from '../lib/firebase/types';
import {
  baseWordPickerTurnNumber,
  canActorStartWaitingRound,
  currentBaseWordPickerUid,
  eligibleBaseWordPickerUids,
  isCurrentBaseWordPicker,
  isEligibleBaseWordPickerPlayer,
  scheduledBaseWordPickerUid,
} from '../lib/online/base-word-picker';

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
      p3: { name: 'Three', wordCount: 0, score: 0, online: true },
    },
    baseWordPickerOrder: ['org', 'p2', 'p3'],
    baseWordRound: 0,
    ...overrides,
  };
}

describe('isEligibleBaseWordPickerPlayer', () => {
  it('requires online and not left', () => {
    expect(
      isEligibleBaseWordPickerPlayer({ name: 'A', wordCount: 0, score: 0, online: true }),
    ).toBe(true);
    expect(
      isEligibleBaseWordPickerPlayer({ name: 'A', wordCount: 0, score: 0, online: false }),
    ).toBe(false);
    expect(
      isEligibleBaseWordPickerPlayer({
        name: 'A',
        wordCount: 0,
        score: 0,
        online: true,
        hasLeft: true,
      }),
    ).toBe(false);
  });
});

describe('currentBaseWordPickerUid', () => {
  it('uses join order and round index', () => {
    expect(currentBaseWordPickerUid(session())).toBe('org');
    expect(currentBaseWordPickerUid(session({ baseWordRound: 1 }))).toBe('p2');
    expect(currentBaseWordPickerUid(session({ baseWordRound: 2 }))).toBe('p3');
    expect(currentBaseWordPickerUid(session({ baseWordRound: 3 }))).toBe('org');
  });

  it('skips offline players in rotation', () => {
    const s = session({
      baseWordRound: 0,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
      baseWordPickerOrder: ['org', 'p2'],
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
  });

  it('skips offline organizer on later rounds', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
      baseWordPickerOrder: ['org', 'p2'],
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
  });

  it('skips missing players', () => {
    const s = session({
      baseWordRound: 1,
      players: { org: { name: 'Org', wordCount: 0, score: 0, online: true } },
    });
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('repairs picker order from roster when guests are missing from stored order', () => {
    const s = session({
      baseWordRound: 1,
      baseWordPickerOrder: ['org'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
  });

  it('lets the previous picker repeat only when alone in a later-round lobby', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false, hasLeft: true },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('prefers another eligible player when organizer and someone else are both online', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    });
    expect(scheduledBaseWordPickerUid(s, 0)).toBe('org');
    expect(currentBaseWordPickerUid(s)).toBe('p2');
  });

  it('does not depend on join order when multiple players are already online', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org', 'p2']);
  });

  it('lets sole first rematcher pick while scheduled peer has not opted in yet', () => {
    const s = session({
      baseWordRound: 1,
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    });
    expect(scheduledBaseWordPickerUid(s, 1)).toBe('p2');
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('rotates rematch round-2 pick to the second player when both have opted in', () => {
    // Org rematched alone and set a word; peer joins before start → peer is picker.
    const s = session({
      baseWordRound: 1,
      baseWord: 'адонізид',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
    expect(canActorStartWaitingRound(s, 'org')).toBe(false);
    expect(canActorStartWaitingRound(s, 'p2')).toBe(true);
  });

  it('lets first rematcher pick and start when scheduled peer still on results', () => {
    // Org rematched first; p2 has not pressed «Грати ще» yet — org may pick/start.
    const s = session({
      baseWordRound: 1,
      baseWord: 'тест',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
      },
    });
    expect(scheduledBaseWordPickerUid(s, 1)).toBe('p2');
    expect(currentBaseWordPickerUid(s)).toBe('org');
    expect(isCurrentBaseWordPicker(s, 'org')).toBe(true);
    expect(canActorStartWaitingRound(s, 'org')).toBe(true);
  });

  it('skips non-opted scheduled picker so next opted-in in room order gets the seat', () => {
    // Round belongs to p2; only org + p3 opted in → p3 (org picked last round).
    const s = session({
      baseWordRound: 1,
      baseWord: 'адонізид',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2', 'p3'],
      resultsExitedBy: { org: true, p3: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: true },
      },
    });
    expect(scheduledBaseWordPickerUid(s, 1)).toBe('p2');
    expect(currentBaseWordPickerUid(s)).toBe('p3');
    expect(canActorStartWaitingRound(s, 'org')).toBe(false);
    expect(canActorStartWaitingRound(s, 'p3')).toBe(true);
  });

  it('allows sole rematcher to pick when scheduled peer has left', () => {
    const s = session({
      baseWordRound: 1,
      baseWord: '',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('keeps rematch word-chooser as picker when briefly offline (multi-sim inactive)', () => {
    // Round 5 (baseWordRound 4): org is scheduled. Org picked, then AppState inactive.
    const s = session({
      baseWordRound: 4,
      baseWord: 'каландрувальниця',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org', 'p2']);
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('keeps round-3 rightful chooser when second rematcher comes online (DSSN2)', () => {
    // Org (scheduled for round 3) set the word first; peer opts in while org is briefly offline.
    const s = session({
      baseWordRound: 2,
      baseWord: 'випещеність',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(scheduledBaseWordPickerUid(s, 2)).toBe('org');
    expect(currentBaseWordPickerUid(s)).toBe('org');
    expect(canActorStartWaitingRound(s, 'org')).toBe(true);
    expect(canActorStartWaitingRound(s, 'p2')).toBe(false);
  });

  it('does not let late joiner steal pick while rightful first rematcher is offline on pick-word', () => {
    // Org opened round 3 first (scheduled + sole rematcher), still on pick-word — no word yet.
    // Peer joins while org is AppState-inactive (online false, latch not on this snapshot).
    const s = session({
      baseWordRound: 2,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordPickerUid: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org', 'p2']);
    expect(currentBaseWordPickerUid(s)).toBe('org');
    expect(isCurrentBaseWordPicker(s, 'p2')).toBe(false);
  });

  it('keeps rightful chooser even if latch is missing (chosenBy sticky)', () => {
    const s = session({
      baseWordRound: 2,
      baseWord: 'випещеність',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('keeps first rematcher as picker via resultsExitedBy latch before any word is set', () => {
    const s = session({
      baseWordRound: 4,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org', 'p2']);
    expect(currentBaseWordPickerUid(s)).toBe('org');
  });

  it('transfers picker to next online when current picker voluntarily left (75AGB)', () => {
    // Round slot is p2; p2 left rematch lobby → org (online + latched) must pick/start.
    const s = session({
      baseWordRound: 5,
      baseWord: '',
      baseWordChosenBy: null,
      baseWordPickerUid: 'p2',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false, hasLeft: true },
      },
    });
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org']);
    expect(currentBaseWordPickerUid(s)).toBe('org');
    expect(isCurrentBaseWordPicker(s, 'p2')).toBe(false);
  });

  it('keeps rightful chooser while briefly offline via durable latch', () => {
    const s = session({
      baseWordRound: 6,
      baseWord: 'мінітракторець',
      baseWordChosenBy: 'org',
      baseWordPickerOrder: ['org', 'p2'],
      resultsExitedBy: { org: true, p2: true },
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
    });
    expect(eligibleBaseWordPickerUids(s)).toEqual(['org', 'p2']);
    expect(currentBaseWordPickerUid(s)).toBe('org');
    expect(isCurrentBaseWordPicker(s, 'p2')).toBe(false);
  });

  it('skips players who permanently left the room', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false, hasLeft: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
        p3: { name: 'Three', wordCount: 0, score: 0, online: true },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('p2');
  });
});

describe('isCurrentBaseWordPicker', () => {
  it('returns true only for active picker', () => {
    const s = session({ baseWordRound: 1 });
    expect(isCurrentBaseWordPicker(s, 'p2')).toBe(true);
    expect(isCurrentBaseWordPicker(s, 'org')).toBe(false);
  });
});

describe('canActorStartWaitingRound', () => {
  it('allows the current online picker, not only the organizer', () => {
    const s = session({
      baseWord: 'тест',
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: false },
        p2: { name: 'Two', wordCount: 0, score: 0, online: true },
      },
      baseWordPickerOrder: ['org', 'p2'],
    });
    expect(canActorStartWaitingRound(s, 'org')).toBe(false);
    expect(canActorStartWaitingRound(s, 'p2')).toBe(true);
  });

  it('allows solo start with one roster player', () => {
    const s = session({
      baseWord: 'тест',
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
      },
    });
    expect(canActorStartWaitingRound(s, 'org')).toBe(true);
  });
});

describe('baseWordPickerTurnNumber', () => {
  it('is one-based', () => {
    expect(baseWordPickerTurnNumber(session({ baseWordRound: 0 }))).toBe(1);
    expect(baseWordPickerTurnNumber(session({ baseWordRound: 2 }))).toBe(3);
  });
});
