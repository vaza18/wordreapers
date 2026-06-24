import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

import {
  buildRoundPlayableLexiconFromDictionary,
  fromPlayableLexiconSnapshot,
  type PlayableLexiconSnapshot,
  type RoundPlayableLexicon,
} from '@/lib/dictionary/round-playable-lexicon';
import {
  getCachedRoundPlayableLexicon,
  setCachedRoundPlayableLexicon,
} from '@/lib/dictionary/round-playable-lexicon-cache';
import {
  loadBundledDictionary,
  loadBundledSupplements,
  releaseBundledDictionaryCaches,
} from '@/services/dictionary-service';

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
      return;
    }

    if (archiveSnapshot) {
      const restored = fromPlayableLexiconSnapshot(archiveSnapshot);
      setCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang, restored);
      setLexicon(restored);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const [dictionary, supplements] = await Promise.all([
            loadBundledDictionary(),
            loadBundledSupplements(),
          ]);
          if (cancelled) {
            return;
          }
          const built = buildRoundPlayableLexiconFromDictionary(
            baseWord,
            dictionary,
            { proper: supplements.properNouns, slang: supplements.slang },
            { allowProperNouns, allowSlang },
          );
          setCachedRoundPlayableLexicon(baseWord, allowProperNouns, allowSlang, built);
          if (releaseDictionaryAfterBuild) {
            releaseBundledDictionaryCaches();
          }
          if (!cancelled) {
            setLexicon(built);
            setLoading(false);
          }
        } catch {
          if (!cancelled) {
            setLexicon(null);
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
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
