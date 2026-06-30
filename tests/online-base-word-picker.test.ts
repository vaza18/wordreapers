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

  it('keeps the sole rematch participant as picker when others have not opted in', () => {
    const s = session({
      baseWordRound: 1,
      players: {
        org: { name: 'Org', wordCount: 0, score: 0, online: true },
        p2: { name: 'Two', wordCount: 0, score: 0, online: false },
        p3: { name: 'Three', wordCount: 0, score: 0, online: false },
      },
    });
    expect(currentBaseWordPickerUid(s)).toBe('org');
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
