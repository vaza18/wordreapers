import { GENERATED_DICTIONARIES_DIR } from '../assets/generated-paths.js';

export { UK_LOCALE } from './locale.js';

/** Generated dictionary files under `assets/generated/dictionaries/` (Metro bundles this folder). */
export const DICTIONARIES_DIR = GENERATED_DICTIONARIES_DIR;

/**
 * Absolute paths to generated dictionary artifacts for one locale.
 *
 * Word lists ship as gzip (`*.txt.gz`); plain `.txt` exists only on device disk cache after extract.
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
  /** Legacy plain paths removed by build / disk-cache cleanup. */
  dictionaryLegacyTxt: string;
  baseWordsLegacyTxt: string;
  supplementProperNounsLegacyTxt: string;
  supplementSlangLegacyTxt: string;
}

/** Basenames of plain text files written to on-device dictionary cache. */
export const DICTIONARY_CACHE_PLAIN_FILES = {
  dictionary: 'dictionary.txt',
  baseWords: 'base_words.txt',
  supplementProperNouns: 'supplement_proper_nouns.txt',
  supplementSlang: 'supplement_slang.txt',
} as const;
