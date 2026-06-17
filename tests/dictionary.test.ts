import { describe, expect, it } from 'vitest';

import {
  normalizeUk,
  letterCount,
  displayForm,
  canonicalForm,
} from '../lib/dictionary/normalize.js';
import {
  isGameDictionaryEntry,
  isGradableAdjectiveLemma,
  isMainDictionaryEntry,
  isNounNominativeSingular,
  isNounPluraliaTantumNominative,
  isBaseWordGeographicalEntry,
  isGeographicalProperNoun,
  isSupplementProperNounEntry,
  isSupplementSlangEntry,
  isExcludedStylistic,
  isPronoun,
  parseVesumLine,
} from '../lib/dictionary/vesum-tags.js';
import {
  canSpellWord,
  buildLetterMultiset,
  validateWord,
} from '../lib/dictionary/validate-word.js';

describe('normalizeUk', () => {
  it('lowercases and strips apostrophes', () => {
    expect(normalizeUk(" КОМП'ЮТЕР ")).toBe('компютер');
    expect(normalizeUk('СІМЯ')).toBe('сімя');
  });
});

describe('vesum tags', () => {
  it('parses visual format lines', () => {
    expect(parseVesumLine("комп'ютер noun:inanim:m:v_naz")).toEqual({
      word: "комп'ютер",
      tags: 'noun:inanim:m:v_naz',
    });
  });

  it('accepts singular nominative nouns', () => {
    expect(isNounNominativeSingular('noun:inanim:m:v_naz')).toBe(true);
    expect(isNounNominativeSingular('noun:inanim:p:v_naz:ns')).toBe(false);
  });

  it('accepts pluralia tantum', () => {
    expect(isNounPluraliaTantumNominative('noun:inanim:p:v_naz:ns')).toBe(true);
  });

  it('rejects proper nouns', () => {
    expect(isGameDictionaryEntry('noun:anim:m:v_naz:prop:fname')).toBe(false);
  });

  it('rejects pronouns', () => {
    expect(isPronoun('noun:inanim:n:v_naz:pron:dem')).toBe(true);
    expect(isPronoun('noun:unanim:m:v_naz:pron:pers:3')).toBe(true);
    expect(isGameDictionaryEntry('noun:inanim:n:v_naz:pron:dem')).toBe(false);
    expect(isMainDictionaryEntry('noun:inanim:n:v_naz:pron:dem', 'те', new Set())).toBe(false);
    expect(isMainDictionaryEntry('noun:anim:m:v_naz', 'стіл', new Set())).toBe(true);
  });

  it('routes proper nouns to supplement', () => {
    expect(isSupplementProperNounEntry('noun:anim:m:v_naz:prop:fname')).toBe(true);
  });

  it('limits base-word proper nouns to geographical entries', () => {
    expect(isGeographicalProperNoun('noun:inanim:m:v_naz:prop:geo')).toBe(true);
    expect(isBaseWordGeographicalEntry('noun:inanim:m:v_naz:prop:geo')).toBe(true);
    expect(isBaseWordGeographicalEntry('noun:anim:m:v_naz:prop:lname')).toBe(false);
    expect(isBaseWordGeographicalEntry('noun:anim:m:v_naz:prop:fname')).toBe(false);
    expect(isBaseWordGeographicalEntry('noun:anim:m:v_naz:prop:pname')).toBe(false);
  });

  it('routes slang nouns to supplement', () => {
    expect(isSupplementSlangEntry('noun:anim:f:v_naz:slang')).toBe(true);
    expect(isGameDictionaryEntry('noun:anim:f:v_naz:slang')).toBe(true);
  });

  it('excludes archaic and substandard stylistic tags from main dictionary', () => {
    expect(isExcludedStylistic('noun:anim:f:v_naz:arch')).toBe(true);
    expect(isExcludedStylistic('noun:inanim:m:v_naz:bad')).toBe(true);
    expect(isExcludedStylistic('noun:anim:m:v_naz:subst')).toBe(true);
    expect(isExcludedStylistic('noun:anim:f:v_naz:vulg')).toBe(true);
    expect(isExcludedStylistic('noun:inanim:m:v_naz:obsc')).toBe(true);
    expect(isMainDictionaryEntry('noun:anim:f:v_naz:arch', 'утка', new Set())).toBe(false);
    expect(isMainDictionaryEntry('noun:anim:f:v_naz', 'качка', new Set())).toBe(true);
    expect(isMainDictionaryEntry('noun:inanim:m:v_naz:obsc', 'хуїльйон', new Set())).toBe(false);
    expect(isMainDictionaryEntry('noun:anim:m:v_naz:vulg', 'бздіти', new Set())).toBe(false);
  });

  it('keeps profanity out of slang supplement', () => {
    expect(isSupplementSlangEntry('noun:anim:f:v_naz:slang:obsc')).toBe(false);
    expect(isSupplementSlangEntry('noun:anim:f:v_naz:slang')).toBe(true);
  });

  it('excludes gradable adjective homographs from main dictionary', () => {
    const homographs = new Set(['чорний']);
    expect(isMainDictionaryEntry('noun:anim:m:v_naz', 'чорний', homographs)).toBe(false);
    expect(isMainDictionaryEntry('noun:anim:m:v_naz', 'демобілізований', homographs)).toBe(true);
    expect(isGradableAdjectiveLemma('adj:m:v_naz:compb')).toBe(true);
    expect(isGradableAdjectiveLemma('adj:m:v_naz:adjp:pasv:imperf')).toBe(false);
  });
});

describe('letter multiset', () => {
  const base = buildLetterMultiset("КОМП'ЮТЕР");

  it('allows valid words', () => {
    expect(canSpellWord('порт', base)).toBe(true);
    expect(canSpellWord('мотор', base)).toBe(false);
  });

  it('allows slang from letters of a custom base word', () => {
    const customBase = buildLetterMultiset('шнягасткість');
    expect(canSpellWord('няшка', customBase)).toBe(true);
  });
});

describe('validateWord structure', () => {
  it('rejects too short', () => {
    const result = validateWord('о', "КОМП'ЮТЕР", { hasInDictionary: () => true });
    expect(result.error).toBe('TOO_SHORT');
  });

  it('rejects base word', () => {
    const result = validateWord("комп'ютер", "КОМП'ЮТЕР", { hasInDictionary: () => true });
    expect(result.error).toBe('IS_BASE_WORD');
  });
});

describe('letterCount', () => {
  it('ignores apostrophes', () => {
    expect(letterCount("комп'ютер")).toBe(8);
  });
});

describe('displayForm', () => {
  const normalization = {
    компютер: "комп'ютер",
    абюдикація: "аб'юдикація",
  };

  it('uppercases normalized words without apostrophes', () => {
    expect(displayForm('абазинка', normalization)).toBe('АБАЗИНКА');
  });

  it('restores apostrophes from normalization map', () => {
    expect(canonicalForm('компютер', normalization)).toBe("комп'ютер");
    expect(displayForm('компютер', normalization)).toBe("КОМП'ЮТЕР");
    expect(displayForm('абюдикація', normalization)).toBe("АБ'ЮДИКАЦІЯ");
  });
});
