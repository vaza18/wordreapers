import { mkdirSync, readFileSync } from 'node:fs';

import {
  createDictionaryIndex,
  DictionaryIndex,
  parseBaseWords,
  type BaseWord,
} from './dictionary-index.js';
import { readGzText } from './gzip-artifacts.js';
import { dictionaryPaths, type DictionaryPaths, ukDictionaryPaths } from './paths-node.js';
import { UK_LOCALE } from './locale.js';

/** Options for loading a locale dictionary from the project root. */
export interface DictionaryLoadOptions {
  root: string;
  locale: string;
}

/**
 * Load the dictionary for a locale under the project root (Node.js scripts/tests).
 */
export function loadDictionary({ root, locale }: DictionaryLoadOptions): DictionaryIndex {
  return loadDictionaryFromPaths(dictionaryPaths(root, locale));
}

/**
 * Load the Ukrainian dictionary (default game locale).
 */
export function loadDictionaryUk(root: string): DictionaryIndex {
  return loadDictionaryFromPaths(ukDictionaryPaths(root));
}

/**
 * Load the dictionary from explicit artifact paths (Node.js).
 */
export function loadDictionaryFromPaths(paths: DictionaryPaths): DictionaryIndex {
  const dictionaryText = readGzText(paths.dictionary);
  const normalizationJson = readFileSync(paths.normalization, 'utf8');
  return createDictionaryIndex(dictionaryText, normalizationJson);
}

/**
 * Load sorted base-word candidates from `base_words.txt.gz` (Node.js).
 */
export function loadBaseWords(root: string, locale: string): BaseWord[] {
  const { baseWords } = dictionaryPaths(root, locale);
  return parseBaseWords(readGzText(baseWords));
}

/**
 * Ensure the locale dictionary directory exists and return its paths.
 */
export function ensureDictionaryDirs(root: string, locale: string): DictionaryPaths {
  const paths = dictionaryPaths(root, locale);
  mkdirSync(paths.dir, { recursive: true });
  return paths;
}

export { UK_LOCALE };
