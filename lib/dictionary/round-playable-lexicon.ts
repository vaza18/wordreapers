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
  /** Yield to the event loop after this many ms of work (default 64). */
  yieldEveryMs?: number;
}

function resolveDisplay(
  normalized: string,
  lookupMainDisplayUpper: BuildRoundPlayableLexiconOptions['lookupMainDisplayUpper'],
): string {
  // O(1) with DictionaryIndex word Set — null means not in main → plain uppercase.
  if (lookupMainDisplayUpper) {
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

/** Words between cancel/time checks — avoids per-word `performance.now()` overhead. */
const ASYNC_CHECK_EVERY_WORDS = 512;
/** Default cooperative slice; higher = faster wall-clock, slightly longer UI stalls. */
const ASYNC_YIELD_EVERY_MS_DEFAULT = 64;

/** Shared collator — per-call `localeCompare('uk')` is very slow on Hermes for large sorts. */
const UK_COLLATOR = new Intl.Collator('uk');

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
  lookupMainDisplayUpper: BuildRoundPlayableLexiconOptions['lookupMainDisplayUpper'];
  accepted: number;
  scanned: number;
};

function createBuildState(
  baseWord: string,
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
    lookupMainDisplayUpper: options.lookupMainDisplayUpper,
    accepted: 0,
    scanned: 0,
  };
}

function considerWord(state: LexiconBuildState, word: string): void {
  state.scanned += 1;
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
  state.displays.set(word, resolveDisplay(word, state.lookupMainDisplayUpper));
  state.accepted += 1;
}

function finalizeBuild(state: LexiconBuildState): RoundPlayableLexicon {
  const sortedWords = [...state.words].sort((a, b) => UK_COLLATOR.compare(a, b));
  return {
    words: state.words,
    sortedWords,
    displays: state.displays,
    maxCount: state.words.size,
  };
}

function logBuildDev(
  label: string,
  filterMs: number,
  finalizeMs: number,
  state: LexiconBuildState,
  yieldCount: number,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }
  console.log(
    `[lexicon] ${label} filterMs=${filterMs.toFixed(0)} finalizeMs=${finalizeMs.toFixed(0)} buildMs=${(filterMs + finalizeMs).toFixed(0)} yields=${yieldCount} scanned=${state.scanned} accepted=${state.accepted}`,
  );
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Build the full set of words that can be scored in a round (sync, may block JS thread).
 */
export function buildRoundPlayableLexicon(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconOptions,
): RoundPlayableLexicon {
  const timing = typeof __DEV__ !== 'undefined' && __DEV__;
  const filterStarted = timing ? nowMs() : 0;
  const state = createBuildState(baseWord, options);
  for (const list of collectSourceLists(sources, options)) {
    for (const word of list) {
      considerWord(state, word);
    }
  }
  const filterMs = timing ? nowMs() - filterStarted : 0;
  const finalizeStarted = timing ? nowMs() : 0;
  const built = finalizeBuild(state);
  const finalizeMs = timing ? nowMs() - finalizeStarted : 0;
  logBuildDev('sync', filterMs, finalizeMs, state, 0);
  return built;
}

/**
 * Same as {@link buildRoundPlayableLexicon}, but yields to the event loop so UI stays responsive.
 *
 * Note: wall-clock is slower than sync because each yield pays a `setTimeout(0)` scheduling cost.
 * Keep slices relatively long so a full ~100k-word pass does not spend most of its time waiting.
 */
export async function buildRoundPlayableLexiconAsync(
  baseWord: string,
  sources: RoundPlayableLexiconSources,
  options: BuildRoundPlayableLexiconAsyncOptions,
): Promise<RoundPlayableLexicon | null> {
  const isCancelled = options.isCancelled ?? (() => false);
  const yieldEveryMs = options.yieldEveryMs ?? ASYNC_YIELD_EVERY_MS_DEFAULT;
  const timing = typeof __DEV__ !== 'undefined' && __DEV__;
  const filterStarted = timing ? nowMs() : 0;
  const state = createBuildState(baseWord, options);
  let sliceStart = nowMs();
  let sinceCheck = 0;
  let yieldCount = 0;

  for (const list of collectSourceLists(sources, options)) {
    for (let i = 0; i < list.length; i += 1) {
      const word = list[i];
      if (word === undefined) {
        continue;
      }
      considerWord(state, word);
      sinceCheck += 1;

      if (sinceCheck < ASYNC_CHECK_EVERY_WORDS) {
        continue;
      }
      sinceCheck = 0;

      if (isCancelled()) {
        return null;
      }

      const now = nowMs();
      if (now - sliceStart >= yieldEveryMs) {
        yieldCount += 1;
        await yieldToEventLoop();
        if (isCancelled()) {
          return null;
        }
        sliceStart = nowMs();
      }
    }
  }

  if (isCancelled()) {
    return null;
  }
  const filterMs = timing ? nowMs() - filterStarted : 0;
  const finalizeStarted = timing ? nowMs() : 0;
  const built = finalizeBuild(state);
  const finalizeMs = timing ? nowMs() - finalizeStarted : 0;
  logBuildDev('async', filterMs, finalizeMs, state, yieldCount);
  return built;
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

/** Validate unknown JSON into a playable lexicon snapshot, or null. */
export function parsePlayableLexiconSnapshot(raw: unknown): PlayableLexiconSnapshot | null {
  if (raw == null || typeof raw !== 'object') {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (typeof row.maxCount !== 'number' || !Number.isFinite(row.maxCount)) {
    return null;
  }
  if (!Array.isArray(row.words) || !row.words.every((word) => typeof word === 'string')) {
    return null;
  }
  if (
    !Array.isArray(row.displays) ||
    !row.displays.every((display) => typeof display === 'string')
  ) {
    return null;
  }
  if (row.words.length !== row.displays.length) {
    return null;
  }
  return {
    maxCount: row.maxCount,
    words: row.words,
    displays: row.displays,
  };
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
