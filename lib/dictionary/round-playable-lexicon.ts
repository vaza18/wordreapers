import type { DictionaryIndex } from './dictionary-index.js';
import { normalizeUk, toDisplayUpper } from './normalize.js';
import { buildLetterMultiset } from './validate-word.js';

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

/** Options for cooperative (non-blocking) lexicon builds. */
export interface BuildRoundPlayableLexiconAsyncOptions extends BuildRoundPlayableLexiconOptions {
  /** Return true to abort the in-flight build. */
  isCancelled?: () => boolean;
  /** Yield to the event loop after this many ms of work (default 8). */
  yieldEveryMs?: number;
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

function collectSourceLists(
  sources: RoundPlayableLexiconSources,
  options: Pick<BuildRoundPlayableLexiconOptions, 'allowProperNouns' | 'allowSlang'>,
): readonly string[][] {
  return [
    sources.main as string[],
    ...(sources.whitelistGeneral ? [sources.whitelistGeneral as string[]] : []),
    ...(options.allowProperNouns && sources.proper ? [sources.proper as string[]] : []),
    ...(options.allowProperNouns && sources.whitelistProper
      ? [sources.whitelistProper as string[]]
      : []),
    ...(options.allowSlang && sources.slang ? [sources.slang as string[]] : []),
    ...(options.allowSlang && sources.whitelistSlang ? [sources.whitelistSlang as string[]] : []),
  ];
}

/**
 * Fast path for already-normalized dictionary words (no apostrophe strip / toLowerCase).
 * Reuses `usedScratch` across calls to avoid per-word Map allocation.
 */
function canSpellNormalizedWord(
  word: string,
  baseMultiset: Map<string, number>,
  usedScratch: Map<string, number>,
): boolean {
  usedScratch.clear();
  for (let i = 0; i < word.length; i += 1) {
    const char = word[i];
    const available = baseMultiset.get(char) ?? 0;
    const need = (usedScratch.get(char) ?? 0) + 1;
    if (need > available) {
      return false;
    }
    usedScratch.set(char, need);
  }
  return true;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

type LexiconBuildState = {
  words: Set<string>;
  displays: Map<string, string>;
  seen: Set<string>;
  usedScratch: Map<string, number>;
  baseMultiset: Map<string, number>;
  baseNorm: string;
  baseLen: number;
  minWordLength: number;
  allowedLetters: Set<string>;
  mainSet: Set<string>;
  lookupMainDisplayUpper: BuildRoundPlayableLexiconOptions['lookupMainDisplayUpper'];
};

function createBuildState(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconOptions,
): LexiconBuildState {
  const baseNorm = normalizeUk(baseWord);
  const baseMultiset = buildLetterMultiset(baseNorm);
  return {
    words: new Set<string>(),
    displays: new Map<string, string>(),
    seen: new Set<string>(),
    usedScratch: new Map<string, number>(),
    baseMultiset,
    baseNorm,
    baseLen: baseNorm.length,
    minWordLength: options.minWordLength ?? 2,
    allowedLetters: new Set(baseMultiset.keys()),
    mainSet: new Set(sources.main),
    lookupMainDisplayUpper: options.lookupMainDisplayUpper,
  };
}

function considerWord(state: LexiconBuildState, word: string): void {
  if (state.seen.has(word)) {
    return;
  }
  state.seen.add(word);

  const len = word.length;
  if (word === state.baseNorm || len < state.minWordLength || len > state.baseLen) {
    return;
  }

  for (let i = 0; i < len; i += 1) {
    if (!state.allowedLetters.has(word[i])) {
      return;
    }
  }

  if (!canSpellNormalizedWord(word, state.baseMultiset, state.usedScratch)) {
    return;
  }

  state.words.add(word);
  state.displays.set(
    word,
    resolveDisplay(word, state.mainSet.has(word), state.lookupMainDisplayUpper),
  );
}

function finalizeBuild(state: LexiconBuildState): RoundPlayableLexicon {
  const sortedWords = [...state.words].sort((a, b) => a.localeCompare(b, 'uk'));
  return {
    words: state.words,
    sortedWords,
    displays: state.displays,
    maxCount: state.words.size,
  };
}

/**
 * Build the full set of words that can be scored in a round (sync, may block JS thread).
 */
export function buildRoundPlayableLexicon(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconOptions,
): RoundPlayableLexicon {
  const state = createBuildState(baseWord, sources, options);
  for (const list of collectSourceLists(sources, options)) {
    for (const word of list) {
      considerWord(state, word);
    }
  }
  return finalizeBuild(state);
}

/**
 * Same as {@link buildRoundPlayableLexicon}, but yields to the event loop so UI stays responsive.
 */
export async function buildRoundPlayableLexiconAsync(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconAsyncOptions,
): Promise<RoundPlayableLexicon | null> {
  const isCancelled = options.isCancelled ?? (() => false);
  const yieldEveryMs = options.yieldEveryMs ?? 8;
  const state = createBuildState(baseWord, sources, options);
  let sliceStart = typeof performance !== 'undefined' ? performance.now() : Date.now();

  for (const list of collectSourceLists(sources, options)) {
    for (let i = 0; i < list.length; i += 1) {
      if (isCancelled()) {
        return null;
      }
      considerWord(state, list[i]);

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - sliceStart >= yieldEveryMs) {
        await yieldToEventLoop();
        if (isCancelled()) {
          return null;
        }
        sliceStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      }
    }
  }

  if (isCancelled()) {
    return null;
  }
  return finalizeBuild(state);
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

function listsFromDictionary(
  dictionary: DictionaryIndex,
  lists: {
    proper: readonly string[];
    slang: readonly string[];
    whitelistGeneral: readonly string[];
    whitelistProper: readonly string[];
    whitelistSlang: readonly string[];
  },
): RoundPlayableLexiconSources {
  return {
    main: dictionary.readonlyWords(),
    proper: lists.proper,
    slang: lists.slang,
    whitelistGeneral: lists.whitelistGeneral,
    whitelistProper: lists.whitelistProper,
    whitelistSlang: lists.whitelistSlang,
  };
}

/** Async cooperative build from a loaded dictionary (non-blocking). */
export async function buildRoundPlayableLexiconFromDictionaryAsync(
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
    BuildRoundPlayableLexiconAsyncOptions,
    'allowProperNouns' | 'allowSlang' | 'minWordLength' | 'isCancelled' | 'yieldEveryMs'
  >,
): Promise<RoundPlayableLexicon | null> {
  return buildRoundPlayableLexiconAsync(baseWord, listsFromDictionary(dictionary, lists), {
    ...options,
    lookupMainDisplayUpper: (normalized) => dictionary.lookupDisplayUpper(normalized),
  });
}
