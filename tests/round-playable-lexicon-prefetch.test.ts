import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DictionaryIndex } from '../lib/dictionary/dictionary-index.js';
import {
  clearRoundPlayableLexiconCache,
  getCachedRoundPlayableLexicon,
  removeCachedRoundPlayableLexicon,
  setCachedRoundPlayableLexicon,
} from '../lib/dictionary/round-playable-lexicon-cache.js';
import {
  clearRoundPlayableLexiconPrefetch,
  getRoundPlayableLexiconPrefetchStatus,
  requestRoundPlayableLexiconPrefetch,
  resetRoundPlayableLexiconPrefetchForTests,
  subscribeRoundPlayableLexiconPrefetch,
} from '../lib/dictionary/round-playable-lexicon-prefetch.js';

vi.mock('../lib/app/schedule-idle-work.js', () => ({
  scheduleIdleWork: (task: () => void) => {
    task();
    return () => undefined;
  },
}));

const MAIN = ['компютер', 'мотор', 'порт', 'рот', 'топ'];

vi.mock('../services/dictionary-service.js', () => ({
  loadBundledDictionary: async () => new DictionaryIndex(MAIN, {}),
  loadBundledSupplements: async () => ({ properNouns: [], slang: [] }),
  loadBundledWhitelists: async () => ({
    general: [],
    properNouns: [],
    slang: [],
  }),
}));

describe('removeCachedRoundPlayableLexicon', () => {
  beforeEach(() => {
    clearRoundPlayableLexiconCache();
  });

  it('removes a single cache entry', () => {
    const lexicon = {
      words: new Set(['порт']),
      sortedWords: ['порт'],
      displays: new Map([['порт', 'порт']]),
      maxCount: 1,
    };
    setCachedRoundPlayableLexicon('портрет', false, false, lexicon);
    removeCachedRoundPlayableLexicon('портрет', false, false);
    expect(getCachedRoundPlayableLexicon('портрет', false, false)).toBeNull();
  });
});

describe('round-playable-lexicon-prefetch', () => {
  beforeEach(() => {
    clearRoundPlayableLexiconCache();
    resetRoundPlayableLexiconPrefetchForTests();
  });

  afterEach(() => {
    resetRoundPlayableLexiconPrefetchForTests();
    clearRoundPlayableLexiconCache();
  });

  it('builds and caches a lexicon', async () => {
    requestRoundPlayableLexiconPrefetch({
      baseWord: 'компютер',
      allowProperNouns: false,
      allowSlang: false,
    });

    await vi.waitFor(() => {
      expect(getRoundPlayableLexiconPrefetchStatus().kind).toBe('ready');
    });

    const cached = getCachedRoundPlayableLexicon('компютер', false, false);
    expect(cached?.maxCount).toBe(3);
    const status = getRoundPlayableLexiconPrefetchStatus();
    expect(status.kind).toBe('ready');
    if (status.kind === 'ready') {
      expect(status.maxCount).toBe(3);
    }
  });

  it('supersedes a previous key and does not leave the old lexicon in cache', async () => {
    requestRoundPlayableLexiconPrefetch({
      baseWord: 'компютер',
      allowProperNouns: false,
      allowSlang: false,
    });
    await vi.waitFor(() => {
      expect(getCachedRoundPlayableLexicon('компютер', false, false)).not.toBeNull();
    });

    requestRoundPlayableLexiconPrefetch({
      baseWord: 'мотор',
      allowProperNouns: false,
      allowSlang: false,
    });
    await vi.waitFor(() => {
      const status = getRoundPlayableLexiconPrefetchStatus();
      expect(status.kind).toBe('ready');
      if (status.kind === 'ready') {
        expect(status.key.startsWith('мотор')).toBe(true);
      }
    });

    expect(getCachedRoundPlayableLexicon('компютер', false, false)).toBeNull();
    expect(getCachedRoundPlayableLexicon('мотор', false, false)).not.toBeNull();
  });

  it('reuses cache without rebuilding', async () => {
    requestRoundPlayableLexiconPrefetch({
      baseWord: 'компютер',
      allowProperNouns: false,
      allowSlang: false,
    });
    await vi.waitFor(() => {
      expect(getRoundPlayableLexiconPrefetchStatus().kind).toBe('ready');
    });

    const statuses: string[] = [];
    const unsubscribe = subscribeRoundPlayableLexiconPrefetch((status) => {
      statuses.push(status.kind);
    });
    requestRoundPlayableLexiconPrefetch({
      baseWord: 'компютер',
      allowProperNouns: false,
      allowSlang: false,
    });
    unsubscribe();

    expect(statuses.at(-1)).toBe('ready');
    expect(getCachedRoundPlayableLexicon('компютер', false, false)?.maxCount).toBe(3);
  });

  it('clears prefetch and evicts cache when input is abandoned', async () => {
    requestRoundPlayableLexiconPrefetch({
      baseWord: 'компютер',
      allowProperNouns: false,
      allowSlang: false,
    });
    await vi.waitFor(() => {
      expect(getCachedRoundPlayableLexicon('компютер', false, false)).not.toBeNull();
    });

    clearRoundPlayableLexiconPrefetch();
    expect(getRoundPlayableLexiconPrefetchStatus().kind).toBe('empty');
    expect(getCachedRoundPlayableLexicon('компютер', false, false)).toBeNull();
  });
});
