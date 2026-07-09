import type { DictionaryIndex } from './dictionary-index.js';
import { letterCount, normalizeUk, toDisplayUpper } from './normalize.js';
import { buildLetterMultiset, canSpellWord } from './validate-word.js';

/** Compact snapshot stored in local finished-round archives (v3). */
export interface PlayableLexiconSnapshot {
  maxCount: number;
  words: string[];
  displays: string[];
}

/** All dictionary words playable in one round for a given base word and settings. */
export interface RoundPlayableLexicon {
  words: ReadonlySet<string>;
  /** Alphabetical order (`uk`) — reuse for results lists instead of re-sorting the set. */
  sortedWords: readonly string[];
  displays: ReadonlyMap<string, string>;
  maxCount: number;
}

/** Word list inputs when building a round lexicon. */
export interface RoundPlayableLexiconSources {
  main: readonly string[];
  proper?: readonly string[];
  slang?: readonly string[];
  whitelistGeneral?: readonly string[];
  whitelistProper?: readonly string[];
  whitelistSlang?: readonly string[];
}

/** Options when filtering dictionary sources into a round lexicon. */
export interface BuildRoundPlayableLexiconOptions {
  allowProperNouns: boolean;
  allowSlang: boolean;
  minWordLength?: number;
  /** Resolve display for main-dictionary entries (apostrophes). */
  lookupMainDisplayUpper?: (normalized: string) => string | null;
}

function resolveDisplay(
  normalized: string,
  inMain: boolean,
  lookupMainDisplayUpper: BuildRoundPlayableLexiconOptions['lookupMainDisplayUpper'],
): string {
  if (inMain && lookupMainDisplayUpper) {
    return lookupMainDisplayUpper(normalized) ?? toDisplayUpper(normalized);
  }
  return toDisplayUpper(normalized);
}

/**
 * Build the full set of words that can be scored in a round.
 */
export function buildRoundPlayableLexicon(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconOptions,
): RoundPlayableLexicon {
  const minWordLength = options.minWordLength ?? 2;
  const baseMultiset = buildLetterMultiset(baseWord);
  const baseNorm = normalizeUk(baseWord);
  const allowedLetters = new Set(baseMultiset.keys());
  const mainSet = new Set(sources.main);

  const lists: ReadonlyArray<readonly string[]> = [
    sources.main,
    ...(sources.whitelistGeneral ? ([sources.whitelistGeneral] as const) : []),
    ...(options.allowProperNouns && sources.proper ? ([sources.proper] as const) : []),
    ...(options.allowProperNouns && sources.whitelistProper
      ? ([sources.whitelistProper] as const)
      : []),
    ...(options.allowSlang && sources.slang ? ([sources.slang] as const) : []),
    ...(options.allowSlang && sources.whitelistSlang ? ([sources.whitelistSlang] as const) : []),
  ];

  const words = new Set<string>();
  const displays = new Map<string, string>();
  const seen = new Set<string>();

  for (const list of lists) {
    for (const word of list) {
      if (seen.has(word)) {
        continue;
      }
      seen.add(word);

      if (word === baseNorm || letterCount(word) < minWordLength) {
        continue;
      }

      let hasAllowedLetter = true;
      for (const ch of word) {
        if (!allowedLetters.has(ch)) {
          hasAllowedLetter = false;
          break;
        }
      }
      if (!hasAllowedLetter || !canSpellWord(word, baseMultiset)) {
        continue;
      }

      words.add(word);
      displays.set(word, resolveDisplay(word, mainSet.has(word), options.lookupMainDisplayUpper));
    }
  }

  const sortedWords = [...words].sort((a, b) => a.localeCompare(b, 'uk'));
  return { words, sortedWords, displays, maxCount: words.size };
}

/** Module cache key for a round lexicon. */
export function lexiconCacheKey(
  baseWord: string,
  allowProperNouns: boolean,
  allowSlang: boolean,
): string {
  return `${normalizeUk(baseWord)}|${allowProperNouns ? 1 : 0}|${allowSlang ? 1 : 0}`;
}

/** Serialize lexicon for local finished-round archives. */
export function toPlayableLexiconSnapshot(lexicon: RoundPlayableLexicon): PlayableLexiconSnapshot {
  const words = [...lexicon.sortedWords];
  const displays = words.map((word) => lexicon.displays.get(word) ?? toDisplayUpper(word));
  return { maxCount: lexicon.maxCount, words, displays };
}

/** Restore lexicon from an archived snapshot. */
export function fromPlayableLexiconSnapshot(
  snapshot: PlayableLexiconSnapshot,
): RoundPlayableLexicon {
  const words = new Set(snapshot.words);
  const displays = new Map<string, string>();
  snapshot.words.forEach((word, index) => {
    displays.set(word, snapshot.displays[index] ?? toDisplayUpper(word));
  });
  return {
    words,
    sortedWords: snapshot.words,
    displays,
    maxCount: snapshot.maxCount,
  };
}

/** Build lexicon using a loaded {@link DictionaryIndex} and supplement/whitelist lists. */
export function buildRoundPlayableLexiconFromDictionary(
  baseWord: string,
  dictionary: DictionaryIndex,
  lists: {
    proper: readonly string[];
    slang: readonly string[];
    whitelistGeneral: readonly string[];
    whitelistProper: readonly string[];
    whitelistSlang: readonly string[];
  },
  options: Pick<
    BuildRoundPlayableLexiconOptions,
    'allowProperNouns' | 'allowSlang' | 'minWordLength'
  >,
): RoundPlayableLexicon {
  return buildRoundPlayableLexicon(
    baseWord,
    {
      main: dictionary.readonlyWords(),
      proper: lists.proper,
      slang: lists.slang,
      whitelistGeneral: lists.whitelistGeneral,
      whitelistProper: lists.whitelistProper,
      whitelistSlang: lists.whitelistSlang,
    },
    {
      ...options,
      lookupMainDisplayUpper: (normalized) => dictionary.lookupDisplayUpper(normalized),
    },
  );
}
