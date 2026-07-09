import { GENERATED_DICTIONARIES_DIR } from '../assets/generated-paths.js';

export { UK_LOCALE } from './locale.js';

/** Generated dictionary files under `assets/generated/dictionaries/` (Metro bundles this folder). */
export const DICTIONARIES_DIR = GENERATED_DICTIONARIES_DIR;

/**
 * Absolute paths to generated dictionary artifacts for one locale.
 *
 * Word lists ship as plain `.txt` (APK/AAB compress them at pack time).
 */
export interface DictionaryPaths {
  dir: string;
  dictionary: string;
  baseWords: string;
  meta: string;
  normalization: string;
  supplementProperNouns: string;
  supplementSlang: string;
  whitelistGeneral: string;
  whitelistProperNouns: string;
  whitelistSlang: string;
  blocklist: string;
  whitelistGeneralSource: string;
  whitelistProperSource: string;
  whitelistSlangSource: string;
  /** Legacy gzip paths removed by build after plain-text migration. */
  dictionaryGz: string;
  baseWordsGz: string;
  supplementProperNounsGz: string;
  supplementSlangGz: string;
  whitelistGeneralGz: string;
  whitelistProperNounsGz: string;
  whitelistSlangGz: string;
}
