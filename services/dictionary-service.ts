import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

import {
  createDictionaryIndex,
  DictionaryIndex,
  parseBaseWords,
  type BaseWord,
} from '@/lib/dictionary/dictionary-index';
import normalizationMap from '../assets/generated/dictionaries/uk-uk/normalization.json';

/** Metro-bundled text assets under `assets/generated/dictionaries/uk-uk/` (`.txt` only — not `.json`). */
const TEXT_ASSET_MODULES = {
  dictionary: require('../assets/generated/dictionaries/uk-uk/dictionary.txt'),
  baseWords: require('../assets/generated/dictionaries/uk-uk/base_words.txt'),
  supplementProperNouns: require('../assets/generated/dictionaries/uk-uk/supplement_proper_nouns.txt'),
  supplementSlang: require('../assets/generated/dictionaries/uk-uk/supplement_slang.txt'),
} as const;

/**
 * Normalize Metro `require()` result for expo-asset (number or `{ uri }`, not raw objects).
 */
function coerceAssetModule(
  moduleRef: unknown,
): number | { uri: string; width: number; height: number } {
  if (typeof moduleRef === 'number') {
    return moduleRef;
  }
  if (moduleRef && typeof moduleRef === 'object') {
    if ('default' in moduleRef) {
      return coerceAssetModule((moduleRef as { default: unknown }).default);
    }
    if ('uri' in moduleRef && typeof (moduleRef as { uri: unknown }).uri === 'string') {
      const candidate = moduleRef as { uri: string; width?: number; height?: number };
      return {
        uri: candidate.uri,
        width: candidate.width ?? 0,
        height: candidate.height ?? 0,
      };
    }
  }
  throw new Error(`Invalid asset module: ${String(moduleRef)}`);
}

async function readAssetText(moduleRef: unknown): Promise<string> {
  const asset = Asset.fromModule(coerceAssetModule(moduleRef));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) {
    throw new Error('Asset URI missing after download');
  }

  try {
    const response = await fetch(uri);
    if (response.ok) {
      return await response.text();
    }
  } catch {
    // Fall back to expo-file-system on Android
  }

  return FileSystem.readAsStringAsync(uri);
}

let cachedMain: DictionaryIndex | null = null;
let cachedBaseWords: BaseWord[] | null = null;
let cachedSupplementProper: string[] | null = null;
let cachedSupplementSlang: string[] | null = null;

/**
 * Load the main dictionary index from bundled assets.
 */
export async function loadBundledDictionary(): Promise<DictionaryIndex> {
  if (cachedMain) {
    return cachedMain;
  }
  const dictionaryText = await readAssetText(TEXT_ASSET_MODULES.dictionary);
  cachedMain = createDictionaryIndex(dictionaryText, normalizationMap);
  return cachedMain;
}

/**
 * Load base words for autocomplete / shuffle from bundled assets.
 */
export async function loadBundledBaseWords(): Promise<BaseWord[]> {
  if (cachedBaseWords) {
    return cachedBaseWords;
  }
  const text = await readAssetText(TEXT_ASSET_MODULES.baseWords);
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
    readAssetText(TEXT_ASSET_MODULES.supplementProperNouns),
    readAssetText(TEXT_ASSET_MODULES.supplementSlang),
  ]);
  cachedSupplementProper = parseBaseWords(properText);
  cachedSupplementSlang = parseBaseWords(slangText);
  return { properNouns: cachedSupplementProper, slang: cachedSupplementSlang };
}

/**
 * Drop in-memory dictionary lists (e.g. after round lexicon is built on play screen).
 */
export function releaseBundledDictionaryCaches(): void {
  cachedMain = null;
  cachedBaseWords = null;
  cachedSupplementProper = null;
  cachedSupplementSlang = null;
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
