import { describe, expect, it } from 'vitest';

import { removeEntranceNormalized } from '../lib/ui/word-list-entrance.js';

describe('removeEntranceNormalized', () => {
  it('returns the same set when the normalized word is absent', () => {
    const current = new Set(['аа', 'бб']);
    expect(removeEntranceNormalized(current, 'вв')).toBe(current);
  });

  it('removes the normalized word from the set', () => {
    const current = new Set(['аа', 'бб', 'вв']);
    const next = removeEntranceNormalized(current, 'бб');
    expect(next).not.toBe(current);
    expect([...next]).toEqual(['аа', 'вв']);
  });
});
