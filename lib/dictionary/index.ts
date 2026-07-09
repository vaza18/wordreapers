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
} from './node-load.js';
export type { DictionaryLoadOptions } from './node-load.js';
export { ukDictionaryPaths } from './paths-node.js';
export type { DictionaryPaths } from './paths.js';
export { DICTIONARIES_DIR, UK_LOCALE } from './paths.js';
export {
  canonicalForm,
  displayForm,
  letterCount,
  normalizeUk,
  toDisplayUpper,
} from './normalize.js';
