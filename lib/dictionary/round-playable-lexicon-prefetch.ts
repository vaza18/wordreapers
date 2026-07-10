import { scheduleIdleWork } from '@/lib/app/schedule-idle-work';
import {
  buildRoundPlayableLexiconFromDictionary,
  lexiconCacheKey,
} from '@/lib/dictionary/round-playable-lexicon';
import {
  getCachedRoundPlayableLexicon,
  removeCachedRoundPlayableLexicon,
  setCachedRoundPlayableLexicon,
} from '@/lib/dictionary/round-playable-lexicon-cache';
import { normalizeUk } from '@/lib/dictionary/normalize';
import {
  loadBundledDictionary,
  loadBundledSupplements,
  loadBundledWhitelists,
} from '@/services/dictionary-service';

/** Parameters for a round lexicon prefetch request. */
export interface RoundPlayableLexiconPrefetchParams {
  baseWord: string;
  allowProperNouns: boolean;
  allowSlang: boolean;
}

/** Module-level status of the latest lexicon prefetch. */
export type RoundPlayableLexiconPrefetchStatus =
  | { kind: 'idle' }
  | { kind: 'empty' }
  | { kind: 'loading'; key: string }
  | { kind: 'ready'; key: string; maxCount: number }
  | { kind: 'error'; key: string };

type PrefetchListener = (status: RoundPlayableLexiconPrefetchStatus) => void;

let status: RoundPlayableLexiconPrefetchStatus = { kind: 'idle' };
let activeKey: string | null = null;
let generation = 0;
let cancelIdleWork: (() => void) | null = null;
const listeners = new Set<PrefetchListener>();

function notify(): void {
  for (const listener of listeners) {
    listener(status);
  }
}

function setStatus(next: RoundPlayableLexiconPrefetchStatus): void {
  status = next;
  notify();
}

function parseKey(key: string): RoundPlayableLexiconPrefetchParams | null {
  const parts = key.split('|');
  if (parts.length !== 3) {
    return null;
  }
  const [baseWord, proper, slang] = parts;
  if (!baseWord) {
    return null;
  }
  return {
    baseWord,
    allowProperNouns: proper === '1',
    allowSlang: slang === '1',
  };
}

function cancelPendingWork(): void {
  generation += 1;
  cancelIdleWork?.();
  cancelIdleWork = null;
}

function evictKey(key: string): void {
  const parsed = parseKey(key);
  if (!parsed) {
    return;
  }
  removeCachedRoundPlayableLexicon(parsed.baseWord, parsed.allowProperNouns, parsed.allowSlang);
}

/**
 * Current prefetch status (module-level; survives screen unmount).
 */
export function getRoundPlayableLexiconPrefetchStatus(): RoundPlayableLexiconPrefetchStatus {
  return status;
}

/**
 * Subscribe to prefetch status changes. Does not cancel in-flight work on unsubscribe.
 */
export function subscribeRoundPlayableLexiconPrefetch(listener: PrefetchListener): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Cancel pending prefetch and clear the empty-input UI state.
 * Evicts the previously active cache entry when abandoning a base word.
 */
export function clearRoundPlayableLexiconPrefetch(): void {
  cancelPendingWork();
  if (activeKey) {
    evictKey(activeKey);
    activeKey = null;
  }
  setStatus({ kind: 'empty' });
}

/**
 * Request a background lexicon build. Survives screen unmount.
 * A newer request with a different cache key supersedes the previous one.
 */
export function requestRoundPlayableLexiconPrefetch(
  params: RoundPlayableLexiconPrefetchParams,
): void {
  const normalized = normalizeUk(params.baseWord);
  if (!normalized) {
    clearRoundPlayableLexiconPrefetch();
    return;
  }

  const key = lexiconCacheKey(normalized, params.allowProperNouns, params.allowSlang);
  const cached = getCachedRoundPlayableLexicon(
    normalized,
    params.allowProperNouns,
    params.allowSlang,
  );
  if (cached) {
    cancelPendingWork();
    if (activeKey && activeKey !== key) {
      evictKey(activeKey);
    }
    activeKey = key;
    setStatus({ kind: 'ready', key, maxCount: cached.maxCount });
    return;
  }

  if (activeKey === key && (status.kind === 'loading' || status.kind === 'ready')) {
    return;
  }

  cancelPendingWork();
  if (activeKey && activeKey !== key) {
    evictKey(activeKey);
  }
  activeKey = key;
  const jobGeneration = generation;
  setStatus({ kind: 'loading', key });

  cancelIdleWork = scheduleIdleWork(() => {
    cancelIdleWork = null;
    void (async () => {
      try {
        const [dictionary, supplements, whitelists] = await Promise.all([
          loadBundledDictionary(),
          loadBundledSupplements(),
          loadBundledWhitelists(),
        ]);
        if (jobGeneration !== generation) {
          return;
        }
        const built = buildRoundPlayableLexiconFromDictionary(
          normalized,
          dictionary,
          {
            proper: supplements.properNouns,
            slang: supplements.slang,
            whitelistGeneral: whitelists.general,
            whitelistProper: whitelists.properNouns,
            whitelistSlang: whitelists.slang,
          },
          {
            allowProperNouns: params.allowProperNouns,
            allowSlang: params.allowSlang,
          },
        );
        if (jobGeneration !== generation) {
          return;
        }
        setCachedRoundPlayableLexicon(
          normalized,
          params.allowProperNouns,
          params.allowSlang,
          built,
        );
        setStatus({ kind: 'ready', key, maxCount: built.maxCount });
      } catch {
        if (jobGeneration !== generation) {
          return;
        }
        setStatus({ kind: 'error', key });
      }
    })();
  });
}

/** Test helper: reset module state between cases. */
export function resetRoundPlayableLexiconPrefetchForTests(): void {
  cancelPendingWork();
  activeKey = null;
  status = { kind: 'idle' };
  listeners.clear();
}
