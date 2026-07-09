import { useEffect, useState } from 'react';

import { scheduleIdleWork } from '@/lib/app/schedule-idle-work';

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
  loadBundledWhitelists,
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

    const cancelIdleWork = scheduleIdleWork(() => {
      void (async () => {
        try {
          const [dictionary, supplements, whitelists] = await Promise.all([
            loadBundledDictionary(),
            loadBundledSupplements(),
            loadBundledWhitelists(),
          ]);
          if (cancelled) {
            return;
          }
          const built = buildRoundPlayableLexiconFromDictionary(
            baseWord,
            dictionary,
            {
              proper: supplements.properNouns,
              slang: supplements.slang,
              whitelistGeneral: whitelists.general,
              whitelistProper: whitelists.properNouns,
              whitelistSlang: whitelists.slang,
            },
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
      cancelIdleWork();
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
