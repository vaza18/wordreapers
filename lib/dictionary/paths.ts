import { join } from 'node:path';

import { GENERATED_DICTIONARIES_DIR } from '../assets/generated-paths.js';
import { UK_LOCALE } from './locale.js';

export { UK_LOCALE };

/** Generated dictionary files under `assets/generated/dictionaries/` (Metro bundles this folder). */
export const DICTIONARIES_DIR = GENERATED_DICTIONARIES_DIR;

/**
 * Absolute paths to generated dictionary artifacts for one locale.
 *
 * BCP 47 locale tag — all dictionary files for one language/region variant.
 * Example: `uk-uk`, future `en-us`.
 *
 *   assets/generated/dictionaries/{locale}/dictionary.txt
 *   dictionaries/{locale}/base_words.txt
 *   dictionaries/{locale}/meta.json
 *   dictionaries/{locale}/normalization.json
 */
export interface DictionaryPaths {
  dir: string;
  dictionary: string;
  baseWords: string;
  meta: string;
  normalization: string;
  supplementProperNouns: string;
  supplementSlang: string;
  blocklist: string;
}

/**
 * Resolve dictionary file paths for a locale under the project root.
 */
export function dictionaryPaths(root: string, locale: string): DictionaryPaths {
  const dir = join(root, DICTIONARIES_DIR, locale);
  return {
    dir,
    dictionary: join(dir, 'dictionary.txt'),
    baseWords: join(dir, 'base_words.txt'),
    meta: join(dir, 'meta.json'),
    normalization: join(dir, 'normalization.json'),
    supplementProperNouns: join(dir, 'supplement_proper_nouns.txt'),
    supplementSlang: join(dir, 'supplement_slang.txt'),
    blocklist: join(root, 'scripts', 'dictionary', `blocklist-${locale}.txt`),
  };
}

/**
 * Resolve dictionary paths for the default Ukrainian locale.
 */
export function ukDictionaryPaths(root: string): DictionaryPaths {
  return dictionaryPaths(root, UK_LOCALE);
}
