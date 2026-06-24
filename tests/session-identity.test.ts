import { describe, expect, it } from 'vitest';

import {
  comparePlayersByJoinOrder,
  maskedDisplayName,
  playerGenderForDisplay,
  rosterJoinOrder,
  sessionIdentityMasked,
} from '../lib/online/public-lobby/session-identity.js';

describe('sessionIdentityMasked', () => {
  it('is true when identityMasked flag is set', () => {
    expect(sessionIdentityMasked({ identityMasked: true, players: {} })).toBe(true);
  });

  it('is true when any player joined via browse', () => {
    expect(
      sessionIdentityMasked({
        players: {
          a: { name: 'A', wordCount: 0, score: 0, joinedVia: 'invite' },
          b: { name: 'B', wordCount: 0, score: 0, joinedVia: 'browse' },
        },
      }),
    ).toBe(true);
  });

  it('is true while room is public', () => {
    expect(
      sessionIdentityMasked({
        isPublic: true,
        players: {
          a: { name: 'A', wordCount: 0, score: 0, publicAlias: 'Гравець 1' },
        },
      }),
    ).toBe(true);
  });

  it('is false when only stale public aliases remain on a private room', () => {
    expect(
      sessionIdentityMasked({
        isPublic: false,
        players: {
          a: { name: 'A', wordCount: 0, score: 0, publicAlias: 'Гравець 1' },
        },
      }),
    ).toBe(false);
  });

  it('is false for invite-only private rooms', () => {
    expect(
      sessionIdentityMasked({
        players: {
          a: { name: 'A', wordCount: 0, score: 0, joinedVia: 'invite' },
        },
      }),
    ).toBe(false);
  });
});

describe('rosterJoinOrder', () => {
  it('follows baseWordPickerOrder then stray uids', () => {
    expect(
      rosterJoinOrder({
        organizerId: 'org',
        baseWordPickerOrder: ['org', 'second'],
        players: {
          org: { name: 'Org', wordCount: 0, score: 0 },
          second: { name: 'Second', wordCount: 0, score: 0 },
          third: { name: 'Third', wordCount: 0, score: 0 },
        },
      }),
    ).toEqual(['org', 'second', 'third']);
  });
});

describe('comparePlayersByJoinOrder', () => {
  it('sorts by join order', () => {
    const order = ['org', 'guest'];
    const rows = [{ uid: 'guest' }, { uid: 'org' }].sort((a, b) =>
      comparePlayersByJoinOrder(a, b, order),
    );
    expect(rows.map((row) => row.uid)).toEqual(['org', 'guest']);
  });
});

describe('maskedDisplayName', () => {
  const session = {
    identityMasked: true,
    isPublic: false,
    players: {},
  };

  it('shows alias to others in masked rooms', () => {
    expect(
      maskedDisplayName({ name: 'Василь', publicAlias: 'Гравець 2' }, 'other', 'viewer', session),
    ).toBe('Гравець 2');
  });

  it('shows real name to self', () => {
    expect(
      maskedDisplayName({ name: 'Василь', publicAlias: 'Гравець 2' }, 'self', 'self', session),
    ).toBe('Василь');
  });
});

describe('playerGenderForDisplay', () => {
  const session = {
    identityMasked: true,
    players: {
      self: { name: 'Self', wordCount: 0, score: 0, gender: 'f' as const },
      other: { name: 'Other', wordCount: 0, score: 0, gender: 'm' as const },
    },
  };

  it('uses masculine agreement for masked opponents (Гравець N)', () => {
    expect(playerGenderForDisplay(session, 'self', 'other')).toBe('m');
  });

  it('shows own gender', () => {
    expect(playerGenderForDisplay(session, 'self', 'self')).toBe('f');
  });
});
