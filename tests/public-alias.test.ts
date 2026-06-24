import { describe, expect, it } from 'vitest';

import {
  collectPublicAliases,
  formatPublicAlias,
  needsPublicAliasReconcile,
  nextPublicAlias,
  publicAliasAssignmentsForRoster,
} from '../lib/online/public-lobby/public-alias.js';
import type { GameSessionPlayer } from '../lib/firebase/types.js';

describe('formatPublicAlias', () => {
  it('formats Ukrainian pseudonyms', () => {
    expect(formatPublicAlias(1, 'uk-uk')).toBe('Гравець 1');
    expect(formatPublicAlias(3, 'uk')).toBe('Гравець 3');
  });

  it('formats English fallback', () => {
    expect(formatPublicAlias(2, 'en')).toBe('Player 2');
  });
});

describe('nextPublicAlias', () => {
  it('assigns first free slot', () => {
    expect(nextPublicAlias([], 'uk-uk')).toBe('Гравець 1');
    expect(nextPublicAlias(['Гравець 1'], 'uk-uk')).toBe('Гравець 2');
  });

  it('skips taken aliases', () => {
    expect(nextPublicAlias(['Гравець 1', 'Гравець 3'], 'uk-uk')).toBe('Гравець 2');
  });

  it('throws when all eight slots are taken', () => {
    const used = Array.from({ length: 8 }, (_, index) => formatPublicAlias(index + 1, 'uk-uk'));
    expect(() => nextPublicAlias(used, 'uk-uk')).toThrow('NO_PUBLIC_ALIAS');
  });
});

describe('publicAliasAssignmentsForRoster', () => {
  it('assigns aliases in join order', () => {
    const assignments = publicAliasAssignmentsForRoster({
      organizerId: 'org',
      baseWordPickerOrder: ['org', 'guest'],
      players: {
        org: { name: 'Org', wordCount: 0, score: 0 },
        guest: { name: 'Guest', wordCount: 0, score: 0, publicAlias: 'Гравець 1' },
      },
    });
    expect(assignments).toEqual({
      org: 'Гравець 1',
      guest: 'Гравець 2',
    });
  });
});

describe('needsPublicAliasReconcile', () => {
  it('is true for masked rooms with stale aliases', () => {
    expect(
      needsPublicAliasReconcile({
        isPublic: false,
        identityMasked: true,
        organizerId: 'org',
        baseWordPickerOrder: ['org', 'guest'],
        settings: {
          durationSeconds: 600,
          uniqueBonusEnabled: false,
          language: 'uk-uk',
          allowProperNouns: false,
          allowSlang: false,
        },
        players: {
          org: { name: 'Org', wordCount: 0, score: 0 },
          guest: { name: 'Guest', wordCount: 0, score: 0 },
        },
      }),
    ).toBe(true);
  });
});

describe('collectPublicAliases', () => {
  it('collects assigned aliases from roster', () => {
    const players: Record<string, GameSessionPlayer> = {
      a: { name: 'A', wordCount: 0, score: 0, publicAlias: 'Гравець 1' },
      b: { name: 'B', wordCount: 0, score: 0 },
      c: { name: 'C', wordCount: 0, score: 0, publicAlias: 'Гравець 3' },
    };
    expect(collectPublicAliases(players)).toEqual(['Гравець 1', 'Гравець 3']);
  });
});
