import type { RoundPlayableLexicon } from '@/lib/dictionary/round-playable-lexicon';
import { lexiconCacheKey } from '@/lib/dictionary/round-playable-lexicon';

const lexiconCache = new Map<string, RoundPlayableLexicon>();

/** Read a cached lexicon for the given round settings, if present. */
export function getCachedRoundPlayableLexicon(
  baseWord: string,
  allowProperNouns: boolean,
  allowSlang: boolean,
): RoundPlayableLexicon | null {
  return lexiconCache.get(lexiconCacheKey(baseWord, allowProperNouns, allowSlang)) ?? null;
}

/** Store a built lexicon in the module cache. */
export function setCachedRoundPlayableLexicon(
  baseWord: string,
  allowProperNouns: boolean,
  allowSlang: boolean,
  lexicon: RoundPlayableLexicon,
): void {
  lexiconCache.set(lexiconCacheKey(baseWord, allowProperNouns, allowSlang), lexicon);
}

/** Remove one cached lexicon (e.g. when the player abandons a base word). */
export function removeCachedRoundPlayableLexicon(
  baseWord: string,
  allowProperNouns: boolean,
  allowSlang: boolean,
): void {
  lexiconCache.delete(lexiconCacheKey(baseWord, allowProperNouns, allowSlang));
}

/** Clear all cached round lexicons (e.g. after dictionary bundle update). */
export function clearRoundPlayableLexiconCache(): void {
  lexiconCache.clear();
}
