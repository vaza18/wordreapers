import {
  createDictionaryIndex,
  DictionaryIndex,
  parseBaseWords,
  type BaseWord,
} from '@/lib/dictionary/dictionary-index';
import { DICTIONARY_CACHE_PLAIN_FILES } from '@/lib/dictionary/paths';
import { readCachedDictionaryText } from '@/lib/dictionary/dictionary-disk-cache';
import normalizationMap from '../assets/generated/dictionaries/uk-uk/normalization.json';

let cachedMain: DictionaryIndex | null = null;
let cachedBaseWords: BaseWord[] | null = null;
let cachedSupplementProper: string[] | null = null;
let cachedSupplementSlang: string[] | null = null;
let cachedWhitelistGeneral: string[] | null = null;
let cachedWhitelistProper: string[] | null = null;
let cachedWhitelistSlang: string[] | null = null;

/**
 * Load the main dictionary index from the on-device cache (populated from bundled `.gz` once per version).
 */
export async function loadBundledDictionary(): Promise<DictionaryIndex> {
  if (cachedMain) {
    return cachedMain;
  }
  const dictionaryText = await readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.dictionary);
  cachedMain = createDictionaryIndex(dictionaryText, normalizationMap);
  return cachedMain;
}

/**
 * Load base words for autocomplete / shuffle from the on-device cache.
 */
export async function loadBundledBaseWords(): Promise<BaseWord[]> {
  if (cachedBaseWords) {
    return cachedBaseWords;
  }
  const text = await readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.baseWords);
  cachedBaseWords = parseBaseWords(text);
  return cachedBaseWords;
}

/**
 * Load supplement word lists (optional round settings).
 */
export async function loadBundledSupplements(): Promise<{
  properNouns: string[];
  slang: string[];
}> {
  if (cachedSupplementProper && cachedSupplementSlang) {
    return { properNouns: cachedSupplementProper, slang: cachedSupplementSlang };
  }
  const [properText, slangText] = await Promise.all([
    readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.supplementProperNouns),
    readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.supplementSlang),
  ]);
  cachedSupplementProper = parseBaseWords(properText);
  cachedSupplementSlang = parseBaseWords(slangText);
  return { properNouns: cachedSupplementProper, slang: cachedSupplementSlang };
}

/**
 * Load whitelist word lists (manual additions missing from VESUM).
 */
export async function loadBundledWhitelists(): Promise<{
  general: string[];
  properNouns: string[];
  slang: string[];
}> {
  if (cachedWhitelistGeneral && cachedWhitelistProper && cachedWhitelistSlang) {
    return {
      general: cachedWhitelistGeneral,
      properNouns: cachedWhitelistProper,
      slang: cachedWhitelistSlang,
    };
  }
  const [generalText, properText, slangText] = await Promise.all([
    readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.whitelistGeneral),
    readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.whitelistProperNouns),
    readCachedDictionaryText(DICTIONARY_CACHE_PLAIN_FILES.whitelistSlang),
  ]);
  cachedWhitelistGeneral = parseBaseWords(generalText);
  cachedWhitelistProper = parseBaseWords(properText);
  cachedWhitelistSlang = parseBaseWords(slangText);
  return {
    general: cachedWhitelistGeneral,
    properNouns: cachedWhitelistProper,
    slang: cachedWhitelistSlang,
  };
}

/**
 * Warm dictionary disk cache during app bootstrap (non-blocking; deferred via scheduleIdleWork).
 */
export { ensureDictionaryDiskCache } from '@/lib/dictionary/dictionary-disk-cache';

/**
 * Drop in-memory dictionary lists (e.g. after round lexicon is built on play screen).
 */
export function releaseBundledDictionaryCaches(): void {
  cachedMain = null;
  cachedBaseWords = null;
  cachedSupplementProper = null;
  cachedSupplementSlang = null;
  cachedWhitelistGeneral = null;
  cachedWhitelistProper = null;
  cachedWhitelistSlang = null;
}

/** Sync peek when assets were already loaded (e.g. lobby lexicon build). */
export function getBundledDictionaryIfLoaded(): DictionaryIndex | null {
  return cachedMain;
}

/** Sync peek for supplement lists when already in memory. */
export function getBundledSupplementsIfLoaded(): {
  properNouns: string[];
  slang: string[];
} | null {
  if (!cachedSupplementProper || !cachedSupplementSlang) {
    return null;
  }
  return { properNouns: cachedSupplementProper, slang: cachedSupplementSlang };
}

/** Sync peek for whitelist lists when already in memory. */
export function getBundledWhitelistsIfLoaded(): {
  general: string[];
  properNouns: string[];
  slang: string[];
} | null {
  if (!cachedWhitelistGeneral || !cachedWhitelistProper || !cachedWhitelistSlang) {
    return null;
  }
  return {
    general: cachedWhitelistGeneral,
    properNouns: cachedWhitelistProper,
    slang: cachedWhitelistSlang,
  };
}

/**
 * Binary search helper for supplement lists loaded at runtime.
 */
export function hasWordInSortedList(words: string[], normalized: string): boolean {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = words[mid];
    if (value === undefined) {
      break;
    }
    const cmp = normalized.localeCompare(value, 'uk');
    if (cmp === 0) {
      return true;
    }
    if (cmp > 0) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return false;
}
