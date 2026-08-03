import { describe, expect, it } from 'vitest';

import { resolvePlayerWordDisplay } from '@/lib/online/player-word-display';

describe('resolvePlayerWordDisplay', () => {
  it('uses lexicon display when present', () => {
    const displays = new Map([['компютер', "КОМП'ЮТЕР"]]);
    expect(resolvePlayerWordDisplay('компютер', displays)).toBe("КОМП'ЮТЕР");
  });

  it('accepts record lexicon displays', () => {
    expect(resolvePlayerWordDisplay('компютер', { компютер: "КОМП'ЮТЕР" })).toBe("КОМП'ЮТЕР");
  });

  it('falls back to toDisplayUpper of normalized', () => {
    expect(resolvePlayerWordDisplay('порт')).toBe('ПОРТ');
    expect(resolvePlayerWordDisplay('порт', new Map())).toBe('ПОРТ');
    // Apostrophe is not in normalized keys — without lexicon this is expected drift.
    expect(resolvePlayerWordDisplay('компютер')).toBe('КОМПЮТЕР');
  });
});
