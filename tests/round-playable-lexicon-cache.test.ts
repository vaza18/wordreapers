import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearRoundPlayableLexiconCache,
  getCachedRoundPlayableLexicon,
  setCachedRoundPlayableLexicon,
} from '../lib/dictionary/round-playable-lexicon-cache.js';

describe('round-playable-lexicon-cache', () => {
  beforeEach(() => {
    clearRoundPlayableLexiconCache();
  });

  it('stores and reads lexicons by base word and settings', () => {
    const lexicon = {
      words: new Set(['порт', 'ретро']),
      sortedWords: ['порт', 'ретро'],
      displays: new Map([['порт', 'порт']]),
      maxCount: 2,
    };

    setCachedRoundPlayableLexicon('портрет', false, false, lexicon);

    expect(getCachedRoundPlayableLexicon('портрет', false, false)).toBe(lexicon);
    expect(getCachedRoundPlayableLexicon('портрет', true, false)).toBeNull();
  });

  it('clears all cached lexicons', () => {
    setCachedRoundPlayableLexicon('тест', false, false, {
      words: new Set(['тес']),
      sortedWords: ['тес'],
      displays: new Map([['тес', 'тес']]),
      maxCount: 1,
    });

    clearRoundPlayableLexiconCache();

    expect(getCachedRoundPlayableLexicon('тест', false, false)).toBeNull();
  });
});
