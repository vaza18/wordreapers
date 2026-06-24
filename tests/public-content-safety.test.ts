import { describe, expect, it } from 'vitest';

import {
  PUBLIC_SAFE_SESSION_SETTINGS,
  applyPublicContentSafety,
  canPublishPublicRoom,
  sessionContentSafetyLocked,
  validateSessionBaseWord,
  withPublicSafeSettings,
} from '../lib/online/public-lobby/content-safety.js';
import type { GameSession } from '../lib/firebase/types.js';

const BASE_WORDS = ['компютер', 'портрет'];

function waitingSession(overrides: Partial<GameSession> = {}): GameSession {
  return {
    baseWord: 'портрет',
    status: 'waiting',
    settings: {
      durationSeconds: 600,
      uniqueBonusEnabled: false,
      language: 'uk-uk',
      allowProperNouns: true,
      allowSlang: true,
    },
    timerEndsAt: Date.now() + 60_000,
    organizerId: 'org',
    players: {
      org: { name: 'Org', wordCount: 0, score: 0, avatarColorIndex: 0 },
    },
    ...overrides,
  };
}

describe('canPublishPublicRoom', () => {
  it('allows publish when waiting with safe base word', () => {
    expect(canPublishPublicRoom(waitingSession(), BASE_WORDS)).toEqual({ ok: true });
  });

  it('blocks when not waiting', () => {
    expect(canPublishPublicRoom(waitingSession({ status: 'playing' }), BASE_WORDS)).toEqual({
      ok: false,
      reason: 'NOT_WAITING',
    });
  });

  it('blocks unsafe base word', () => {
    expect(canPublishPublicRoom(waitingSession({ baseWord: 'няшка' }), BASE_WORDS)).toEqual({
      ok: false,
      reason: 'BASE_WORD_NOT_ALLOWED_PUBLIC',
    });
  });

  it('blocks missing base word', () => {
    expect(canPublishPublicRoom(waitingSession({ baseWord: '' }), BASE_WORDS)).toEqual({
      ok: false,
      reason: 'BASE_WORD_MISSING',
    });
  });
});

describe('withPublicSafeSettings', () => {
  it('locks slang and proper nouns off', () => {
    const locked = withPublicSafeSettings(waitingSession().settings);
    expect(locked).toMatchObject(PUBLIC_SAFE_SESSION_SETTINGS);
    expect(locked.allowSlang).toBe(false);
    expect(locked.allowProperNouns).toBe(false);
  });
});

describe('sessionContentSafetyLocked', () => {
  it('is true while room is public', () => {
    expect(sessionContentSafetyLocked({ isPublic: true, players: {} })).toBe(true);
  });

  it('is true after browse join', () => {
    expect(
      sessionContentSafetyLocked({
        players: {
          a: { name: 'A', wordCount: 0, score: 0, joinedVia: 'browse' },
        },
      }),
    ).toBe(true);
  });

  it('is false for invite-only private rooms', () => {
    expect(
      sessionContentSafetyLocked({
        players: {
          a: { name: 'A', wordCount: 0, score: 0, joinedVia: 'invite' },
        },
      }),
    ).toBe(false);
  });

  it('is false after public toggle off before browse join', () => {
    expect(
      sessionContentSafetyLocked({
        isPublic: false,
        players: {
          a: { name: 'A', wordCount: 0, score: 0, publicAlias: 'Гравець 1' },
        },
      }),
    ).toBe(false);
  });

  it('stays true after browse join even when room is private again', () => {
    expect(
      sessionContentSafetyLocked({
        isPublic: false,
        players: {
          a: { name: 'A', wordCount: 0, score: 0, joinedVia: 'browse' },
        },
      }),
    ).toBe(true);
  });
});

describe('applyPublicContentSafety', () => {
  it('forces safe dictionary flags after browse join', () => {
    const locked = applyPublicContentSafety(waitingSession().settings, {
      identityMasked: true,
      players: {},
    });
    expect(locked.allowProperNouns).toBe(false);
    expect(locked.allowSlang).toBe(false);
  });
});

describe('validateSessionBaseWord', () => {
  it('allows any base word in invite-only private rooms', () => {
    expect(
      validateSessionBaseWord('няшка', BASE_WORDS, {
        players: {
          org: { name: 'Org', wordCount: 0, score: 0, joinedVia: 'invite' },
        },
      }),
    ).toEqual({ ok: true });
  });

  it('requires allowlist after browse join', () => {
    expect(
      validateSessionBaseWord('портрет', BASE_WORDS, {
        identityMasked: true,
        players: {},
      }),
    ).toEqual({ ok: true });
    expect(
      validateSessionBaseWord('няшка', BASE_WORDS, {
        identityMasked: true,
        players: {},
      }),
    ).toEqual({ ok: false, reason: 'BASE_WORD_NOT_ALLOWED' });
  });

  it('allows any base word when only stale public aliases remain', () => {
    expect(
      validateSessionBaseWord('няшка', BASE_WORDS, {
        isPublic: false,
        players: {
          guest: {
            name: 'Guest',
            wordCount: 0,
            score: 0,
            publicAlias: 'Гравець 2',
          },
        },
      }),
    ).toEqual({ ok: true });
  });
});
