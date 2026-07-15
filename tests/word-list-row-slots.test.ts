import { describe, expect, it } from 'vitest';

import { wordListRowShowsX2Badge } from '@/lib/ui/word-list-row-slots';

describe('wordListRowShowsX2Badge', () => {
  it('is true only for x2 when score badges are enabled', () => {
    expect(wordListRowShowsX2Badge(true, 'x2')).toBe(true);
    expect(wordListRowShowsX2Badge(true, '+2')).toBe(false);
    expect(wordListRowShowsX2Badge(true, null)).toBe(false);
    expect(wordListRowShowsX2Badge(false, 'x2')).toBe(false);
  });
});
