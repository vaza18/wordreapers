import { useEffect, useState } from 'react';

import {
  fromPlayableLexiconSnapshot,
  lexiconCacheKey,
  type PlayableLexiconSnapshot,
  type RoundPlayableLexicon,
} from '@/lib/dictionary/round-playable-lexicon';
import {
  getCachedRoundPlayableLexicon,
  setCachedRoundPlayableLexicon,
} from '@/lib/dictionary/round-playable-lexicon-cache';
import {
  getRoundPlayableLexiconPrefetchStatus,
  requestRoundPlayableLexiconPrefetch,
  subscribeRoundPlayableLexiconPrefetch,
} from '@/lib/dictionary/round-playable-lexicon-prefetch';
import { normalizeUk } from '@/lib/dictionary/normalize';
import { releaseBundledDictionaryCaches } from '@/services/dictionary-service';

export interface UseRoundPlayableLexiconOptions {
  baseWord: string;
  allowProperNouns: boolean;
  allowSlang: boolean;
  /** When true, drop full dictionary from RAM after lexicon is ready (play screen). */
  releaseDictionaryAfterBuild?: boolean;
  /** Restore lexicon from archive without rebuilding. */
  archiveSnapshot?: PlayableLexiconSnapshot | null;
  enabled?: boolean;
}

export interface UseRoundPlayableLexiconResult {
  lexicon: RoundPlayableLexicon | null;
  loading: boolean;
}

/**
 * Build or restore the playable-word lexicon for a round (deferred, cached).
 * Shares in-flight work with setup/pick-word prefetch so navigation reuses the same build.
 */
export function useRoundPlayableLexicon({
  baseWord,
  allowProperNouns,
  allowSlang,
  releaseDictionaryAfterBuild = false,
  archiveSnapshot = null,
  enabled = true,
}: UseRoundPlayableLexiconOptions): UseRoundPlayableLexiconResult {
  const [lexicon, setLexicon] = useState<RoundPlayableLexicon | null>(() => {
    if (!enabled || !baseWord) {
      return null;
    }
    const cached = getCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang);
    if (cached) {
      return cached;
    }
    if (archiveSnapshot) {
      const restored = fromPlayableLexiconSnapshot(archiveSnapshot);
      setCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang, restored);
      return restored;
    }
    return null;
  });
  const [loading, setLoading] = useState(
    () => enabled && Boolean(baseWord) && lexicon === null && !archiveSnapshot,
  );

  useEffect(() => {
    if (!enabled || !baseWord) {
      setLexicon(null);
      setLoading(false);
      return;
    }

    const cached = getCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang);
    if (cached) {
      setLexicon(cached);
      setLoading(false);
      if (releaseDictionaryAfterBuild) {
        releaseBundledDictionaryCaches();
      }
      return;
    }

    if (archiveSnapshot) {
      const restored = fromPlayableLexiconSnapshot(archiveSnapshot);
      setCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang, restored);
      setLexicon(restored);
      setLoading(false);
      if (releaseDictionaryAfterBuild) {
        releaseBundledDictionaryCaches();
      }
      return;
    }

    const normalized = normalizeUk(baseWord);
    const key = lexiconCacheKey(normalized, allowProperNouns, allowSlang);
    setLoading(true);

    const applyReady = () => {
      const ready = getCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang);
      if (ready) {
        setLexicon(ready);
        setLoading(false);
        if (releaseDictionaryAfterBuild) {
          releaseBundledDictionaryCaches();
        }
        return true;
      }
      return false;
    };

    if (applyReady()) {
      return;
    }

    const unsubscribe = subscribeRoundPlayableLexiconPrefetch((status) => {
      if (status.kind === 'ready' && status.key === key) {
        applyReady();
        return;
      }
      if (status.kind === 'error' && status.key === key) {
        setLexicon(null);
        setLoading(false);
        return;
      }
      if (status.kind === 'loading' && status.key === key) {
        setLoading(true);
      }
    });

    const current = getRoundPlayableLexiconPrefetchStatus();
    if (
      !(current.kind === 'loading' && current.key === key) &&
      !(current.kind === 'ready' && current.key === key)
    ) {
      requestRoundPlayableLexiconPrefetch({
        baseWord,
        allowProperNouns,
        allowSlang,
      });
    }

    return () => {
      unsubscribe();
    };
  }, [
    allowProperNouns,
    allowSlang,
    archiveSnapshot,
    baseWord,
    enabled,
    releaseDictionaryAfterBuild,
  ]);

  return { lexicon, loading };
}
