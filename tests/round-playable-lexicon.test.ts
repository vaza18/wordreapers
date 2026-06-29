import { describe, expect, it } from 'vitest';

import {
  buildRoundPlayableLexicon,
  fromPlayableLexiconSnapshot,
  toPlayableLexiconSnapshot,
} from '../lib/dictionary/round-playable-lexicon';
import { validateWord } from '../lib/dictionary/validate-word';
import { buildResultsWordList } from '../lib/game/results-missing-words';

const MAIN = ['порт', 'рот', 'топ', 'компютер', 'мотор'];
const PROPER = ['київ'];
const SLANG = ['няшка'];

describe('buildRoundPlayableLexicon', () => {
  it('counts main-dictionary words for компютер', () => {
    const lexicon = buildRoundPlayableLexicon(
      'компютер',
      { main: MAIN },
      { allowProperNouns: false, allowSlang: false },
    );
    expect(lexicon.maxCount).toBe(3);
    expect(lexicon.words.has('порт')).toBe(true);
    expect(lexicon.words.has('мотор')).toBe(false);
    expect(lexicon.words.has('компютер')).toBe(false);
  });

  it('includes supplements when enabled', () => {
    const lexicon = buildRoundPlayableLexicon(
      'шнягасткість',
      { main: MAIN, proper: PROPER, slang: SLANG },
      { allowProperNouns: true, allowSlang: true },
    );
    expect(lexicon.words.has('няшка')).toBe(true);
  });

  it('excludes supplements for public-safe settings', () => {
    const lexicon = buildRoundPlayableLexicon(
      'шнягасткість',
      { main: MAIN, proper: PROPER, slang: SLANG },
      { allowProperNouns: false, allowSlang: false },
    );
    expect(lexicon.words.has('няшка')).toBe(false);
    expect(lexicon.words.has('київ')).toBe(false);
  });

  it('round-trips snapshot', () => {
    const lexicon = buildRoundPlayableLexicon(
      'компютер',
      { main: MAIN },
      { allowProperNouns: false, allowSlang: false },
    );
    expect([...lexicon.sortedWords]).toEqual(
      [...lexicon.words].sort((a, b) => a.localeCompare(b, 'uk')),
    );
    const restored = fromPlayableLexiconSnapshot(toPlayableLexiconSnapshot(lexicon));
    expect(restored.maxCount).toBe(lexicon.maxCount);
    expect(restored.words.has('порт')).toBe(true);
    expect(restored.displays.get('порт')).toBe('ПОРТ');
    expect(restored.sortedWords).toEqual(lexicon.sortedWords);
  });
});

describe('validateWord roundLexicon', () => {
  const lexicon = buildRoundPlayableLexicon(
    'компютер',
    { main: MAIN },
    { allowProperNouns: false, allowSlang: false },
  );

  it('matches full path for playable words', () => {
    const full = validateWord('порт', 'компютер', {
      hasInDictionary: (word) => MAIN.includes(word),
    });
    const fast = validateWord(
      'порт',
      'компютер',
      { hasInDictionary: () => false },
      { roundLexicon: lexicon.words },
    );
    expect(full).toEqual(fast);
  });

  it('rejects invalid letters via lexicon path', () => {
    const result = validateWord(
      'мотор',
      'компютер',
      { hasInDictionary: () => true },
      { roundLexicon: lexicon.words },
    );
    expect(result.valid).toBe(false);
    expect(result.error).toBe('INVALID_LETTERS');
  });
});

describe('buildResultsWordList', () => {
  const lexicon = buildRoundPlayableLexicon(
    'компютер',
    { main: MAIN },
    { allowProperNouns: false, allowSlang: false },
  );
  const globalWords = [
    {
      normalized: 'порт',
      display: 'ПОРТ',
      authors: [],
      showX2: false,
    },
  ];

  it('returns only found words when toggle is off', () => {
    const rows = buildResultsWordList(globalWords, lexicon, false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.found).toBe(true);
  });

  it('includes missed words when toggle is on', () => {
    const rows = buildResultsWordList(globalWords, lexicon, true);
    expect(rows.length).toBe(lexicon.maxCount);
    expect(rows.some((row) => row.normalized === 'порт' && row.found)).toBe(true);
    expect(rows.some((row) => row.normalized === 'рот' && !row.found)).toBe(true);
  });
});
