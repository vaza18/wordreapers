import { join } from 'node:path';

export { DICTIONARIES_DIR, UK_LOCALE } from './paths.js';
export type { DictionaryPaths } from './paths.js';
import { DICTIONARIES_DIR, UK_LOCALE, type DictionaryPaths } from './paths.js';
import { gzipWordListFilename } from './gzip-artifacts.js';

/**
 * Resolve dictionary file paths for a locale under the project root.
 */
export function dictionaryPaths(root: string, locale: string): DictionaryPaths {
  const dir = join(root, DICTIONARIES_DIR, locale);
  return {
    dir,
    dictionary: join(dir, gzipWordListFilename('dictionary')),
    baseWords: join(dir, gzipWordListFilename('base_words')),
    meta: join(dir, 'meta.json'),
    normalization: join(dir, 'normalization.json'),
    supplementProperNouns: join(dir, gzipWordListFilename('supplement_proper_nouns')),
    supplementSlang: join(dir, gzipWordListFilename('supplement_slang')),
    blocklist: join(root, 'scripts', 'dictionary', `blocklist-${locale}.txt`),
    dictionaryLegacyTxt: join(dir, 'dictionary.txt'),
    baseWordsLegacyTxt: join(dir, 'base_words.txt'),
    supplementProperNounsLegacyTxt: join(dir, 'supplement_proper_nouns.txt'),
    supplementSlangLegacyTxt: join(dir, 'supplement_slang.txt'),
  };
}

/**
 * Resolve dictionary paths for the default Ukrainian locale.
 */
export function ukDictionaryPaths(root: string): DictionaryPaths {
  return dictionaryPaths(root, UK_LOCALE);
}
