import { describe, expect, it } from 'vitest';

import {
  displayPlayerName,
  viewerPublicAlias,
} from '../lib/online/public-lobby/display-player-name.js';

describe('displayPlayerName', () => {
  const publicSession = { isPublic: true as const, players: {} };

  it('shows real name to the player themselves', () => {
    expect(
      displayPlayerName(
        { name: 'Василь', publicAlias: 'Гравець 2' },
        'uid-self',
        'uid-self',
        publicSession,
      ),
    ).toBe('Василь');
  });

  it('shows pseudonym to other players in public rooms', () => {
    expect(
      displayPlayerName(
        { name: 'Василь', publicAlias: 'Гравець 2' },
        'viewer',
        'other',
        publicSession,
      ),
    ).toBe('Гравець 2');
  });

  it('falls back to real name in private invite-only rooms', () => {
    expect(
      displayPlayerName({ name: 'Василь' }, 'viewer', 'other', {
        isPublic: false,
        players: { other: { name: 'Василь', wordCount: 0, score: 0, joinedVia: 'invite' } },
      }),
    ).toBe('Василь');
  });

  it('keeps pseudonym in finished public rooms with browse exposure', () => {
    expect(
      displayPlayerName(
        { name: 'iPhone 13 Pro Max', publicAlias: 'Гравець 1' },
        'viewer',
        'other',
        {
          isPublic: false,
          identityMasked: true,
          players: {
            other: {
              name: 'iPhone 13 Pro Max',
              wordCount: 0,
              score: 0,
              publicAlias: 'Гравець 1',
            },
          },
        },
      ),
    ).toBe('Гравець 1');
  });

  it('keeps pseudonym after unpublish when room was browse-joined', () => {
    expect(
      displayPlayerName({ name: 'Василь', publicAlias: 'Гравець 2' }, 'viewer', 'other', {
        isPublic: false,
        identityMasked: true,
        players: {},
      }),
    ).toBe('Гравець 2');
  });

  it('falls back to real name when alias is missing in public room', () => {
    expect(displayPlayerName({ name: 'Василь' }, 'viewer', 'other', publicSession)).toBe('Василь');
  });

  it('falls back to pseudonym for self when name is missing in masked room', () => {
    expect(
      displayPlayerName({ publicAlias: 'Гравець 2' }, 'uid-self', 'uid-self', {
        isPublic: false,
        identityMasked: true,
        organizerId: 'org',
        baseWordPickerOrder: ['org', 'uid-self'],
        settings: { language: 'uk-uk' },
        players: {},
      }),
    ).toBe('Гравець 2');
  });

  it('falls back to roster alias when player node is missing', () => {
    expect(
      displayPlayerName(undefined, 'viewer', 'guest', {
        isPublic: false,
        organizerId: 'org',
        baseWordPickerOrder: ['org', 'guest'],
        settings: { language: 'uk-uk' },
        players: {},
      }),
    ).toBe('Гравець 2');
  });
});

describe('viewerPublicAlias', () => {
  it('returns alias in masked rooms', () => {
    expect(
      viewerPublicAlias({ publicAlias: 'Гравець 1' }, { identityMasked: true, players: {} }),
    ).toBe('Гравець 1');
  });

  it('returns null in invite-only private rooms', () => {
    expect(viewerPublicAlias({ publicAlias: 'Гравець 1' }, { players: {} })).toBeNull();
  });
});
