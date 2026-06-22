import { describe, expect, it } from 'vitest';

import {
  findLastAddedNormalized,
  findRowIndexByNormalized,
  rowScrollOffset,
} from '../word-list-scroll.js';

describe('findLastAddedNormalized', () => {
  it('returns null when nothing was added', () => {
    expect(findLastAddedNormalized(['аа', 'бб'], ['аа', 'бб'])).toBeNull();
  });

  it('returns the last added word in acceptance order', () => {
    expect(findLastAddedNormalized(['аа'], ['аа', 'яр', 'як'])).toBe('як');
  });

  it('returns the only new word', () => {
    expect(findLastAddedNormalized(['сад', 'тон'], ['сад', 'тон', 'яр'])).toBe('яр');
  });
});

describe('findRowIndexByNormalized', () => {
  it('finds sorted row index', () => {
    const rows = [{ entry: { normalized: 'аа' } }, { entry: { normalized: 'яр' } }];
    expect(findRowIndexByNormalized(rows, 'яр')).toBe(1);
  });
});

describe('rowScrollOffset', () => {
  it('multiplies index by row height', () => {
    expect(rowScrollOffset(3, 42)).toBe(126);
  });
});
