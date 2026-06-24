import { describe, expect, it } from 'vitest';

import {
  RESULTS_ALL_AUTHORS_VISIBLE_MAX,
  RESULTS_OVERFLOW_AVATAR_VISIBLE,
  splitResultWordAuthors,
} from '../result-word-authors.js';

describe('splitResultWordAuthors', () => {
  const authors = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ playerId: `p${index}` }));

  it('shows all authors when within cap', () => {
    const input = authors(RESULTS_ALL_AUTHORS_VISIBLE_MAX);
    expect(splitResultWordAuthors(input)).toEqual({ visible: input, overflow: [] });
  });

  it('shows three avatars and overflow for larger groups', () => {
    const input = authors(8);
    const { visible, overflow } = splitResultWordAuthors(input);
    expect(visible).toHaveLength(RESULTS_OVERFLOW_AVATAR_VISIBLE);
    expect(overflow).toHaveLength(5);
  });
});
