export {
  createDictionaryIndex,
  DictionaryIndex,
  parseBaseWords,
  parseWordList,
} from './dictionary-index.js';
export type { BaseWord } from './dictionary-index.js';
export {
  ensureDictionaryDirs,
  loadBaseWords,
  loadDictionary,
  loadDictionaryFromPaths,
  loadDictionaryUk,
  UK_LOCALE,
} from './node-load.js';
export type { DictionaryLoadOptions } from './node-load.js';
export { ukDictionaryPaths, DICTIONARIES_DIR } from './paths.js';
export type { DictionaryPaths } from './paths.js';
export {
  canonicalForm,
  displayForm,
  letterCount,
  normalizeUk,
  toDisplayUpper,
} from './normalize.js';
