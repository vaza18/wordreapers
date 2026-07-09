import { join } from 'node:path';

export { DICTIONARIES_DIR, UK_LOCALE } from './paths.js';
export type { DictionaryPaths } from './paths.js';
import { DICTIONARIES_DIR, UK_LOCALE, type DictionaryPaths } from './paths.js';

function wordListPath(dir: string, basename: string): string {
  return join(dir, `${basename}.txt`);
}

function gzWordListPath(dir: string, basename: string): string {
  return join(dir, `${basename}.txt.gz`);
}

/**
 * Resolve dictionary file paths for a locale under the project root.
 */
export function dictionaryPaths(root: string, locale: string): DictionaryPaths {
  const dir = join(root, DICTIONARIES_DIR, locale);
  return {
    dir,
    dictionary: wordListPath(dir, 'dictionary'),
    baseWords: wordListPath(dir, 'base_words'),
    meta: join(dir, 'meta.json'),
    normalization: join(dir, 'normalization.json'),
    supplementProperNouns: wordListPath(dir, 'supplement_proper_nouns'),
    supplementSlang: wordListPath(dir, 'supplement_slang'),
    whitelistGeneral: wordListPath(dir, 'whitelist_general'),
    whitelistProperNouns: wordListPath(dir, 'whitelist_proper_nouns'),
    whitelistSlang: wordListPath(dir, 'whitelist_slang'),
    blocklist: join(root, 'scripts', 'dictionary', `blocklist-${locale}.txt`),
    whitelistGeneralSource: join(root, 'scripts', 'dictionary', `whitelist-${locale}-general.txt`),
    whitelistProperSource: join(root, 'scripts', 'dictionary', `whitelist-${locale}-proper.txt`),
    whitelistSlangSource: join(root, 'scripts', 'dictionary', `whitelist-${locale}-slang.txt`),
    dictionaryGz: gzWordListPath(dir, 'dictionary'),
    baseWordsGz: gzWordListPath(dir, 'base_words'),
    supplementProperNounsGz: gzWordListPath(dir, 'supplement_proper_nouns'),
    supplementSlangGz: gzWordListPath(dir, 'supplement_slang'),
    whitelistGeneralGz: gzWordListPath(dir, 'whitelist_general'),
    whitelistProperNounsGz: gzWordListPath(dir, 'whitelist_proper_nouns'),
    whitelistSlangGz: gzWordListPath(dir, 'whitelist_slang'),
  };
}

/**
 * Resolve dictionary paths for the default Ukrainian locale.
 */
export function ukDictionaryPaths(root: string): DictionaryPaths {
  return dictionaryPaths(root, UK_LOCALE);
}
