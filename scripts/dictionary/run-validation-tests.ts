import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDictionaryUk } from '../../lib/dictionary/index.js';
import { validateWord } from '../../lib/dictionary/validate-word.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const BASE_WORD = "КОМП'ЮТЕР";

interface Case {
  word: string;
  expectValid: boolean;
  error?: string;
}

const VALID: Case[] = [
  { word: 'ом', expectValid: true },
  { word: 'рот', expectValid: true },
  { word: 'тор', expectValid: true },
  { word: 'мор', expectValid: true },
  { word: 'рок', expectValid: true },
  { word: 'порт', expectValid: true },
  { word: 'метр', expectValid: true },
  { word: 'темп', expectValid: true },
  { word: 'корт', expectValid: true },
  { word: 'крем', expectValid: true },
  { word: 'трюм', expectValid: true },
  { word: ' РОТ ', expectValid: true },
];

const INVALID: Case[] = [
  { word: 'мотор', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'ритм', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'комір', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'покрут', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'торф', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'мама', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'терем', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'рем', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'ор', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'пор', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'петер', expectValid: false, error: 'INVALID_LETTERS' },
  { word: 'котре', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'прем', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'проте', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'юрт', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: 'петро', expectValid: false, error: 'NOT_IN_DICTIONARY' },
  { word: "комп'ютер", expectValid: false, error: 'IS_BASE_WORD' },
  { word: 'о', expectValid: false, error: 'TOO_SHORT' },
];

function runCases(label: string, cases: Case[], dict: ReturnType<typeof loadDictionaryUk>): number {
  let failed = 0;
  for (const c of cases) {
    const result = validateWord(c.word, BASE_WORD, {
      hasInDictionary: (w) => dict.hasWord(w),
    });
    const ok = result.valid === c.expectValid && (c.expectValid || result.error === c.error);

    if (!ok) {
      failed += 1;
      console.error(
        `✗ ${label} "${c.word}": expected valid=${c.expectValid}${c.error ? ` ${c.error}` : ''}, got valid=${result.valid} ${result.error ?? ''}`,
      );
    }
  }
  return failed;
}

async function main(): Promise<void> {
  const dict = loadDictionaryUk(ROOT);
  let failed = 0;
  failed += runCases('valid', VALID, dict);
  failed += runCases('invalid', INVALID, dict);

  // Apostrophe normalization spot-check
  const comp = validateWord("КОМП'ЮТЕР", "КОМП'ЮТЕРИЗАЦІЯ", {
    hasInDictionary: (w) => dict.hasWord(w),
  });
  if (!comp.valid || comp.error) {
    failed += 1;
    console.error("✗ apostrophe комп'ютер from КОМП'ЮТЕРИЗАЦІЯ");
  }

  const comp2 = validateWord('КОМПЮТЕР', "КОМП'ЮТЕРИЗАЦІЯ", {
    hasInDictionary: (w) => dict.hasWord(w),
  });
  if (!comp2.valid) {
    failed += 1;
    console.error('✗ apostrophe компютер without apostrophe input');
  }

  const simea = validateWord('СІМЯ', 'МІСЯЦЬ', {
    hasInDictionary: (w) => dict.hasWord(w),
  });
  if (!simea.valid) {
    failed += 1;
    console.error("✗ сім'я normalization");
  }

  const shtany = validateWord('штани', 'ШТАНГЕНЦИРКУЛЬ', {
    hasInDictionary: (w) => dict.hasWord(w),
  });
  if (!shtany.valid) {
    failed += 1;
    console.error('✗ pluralia tantum штани');
  }

  if (failed > 0) {
    console.error(`\n${failed} validation case(s) failed.`);
    process.exit(1);
  }

  console.log('All validation_test_cases checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
