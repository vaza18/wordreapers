import { useEffect, useRef, useState } from 'react';

import { VALIDATION_DEBOUNCE_MS } from '@/constants/game-timing';
import { lexiconCacheKey } from '@/lib/dictionary/round-playable-lexicon';
import { normalizeUk } from '@/lib/dictionary/normalize';
import {
  clearRoundPlayableLexiconPrefetch,
  requestRoundPlayableLexiconPrefetch,
  subscribeRoundPlayableLexiconPrefetch,
  type RoundPlayableLexiconPrefetchStatus,
} from '@/lib/dictionary/round-playable-lexicon-prefetch';

export type SetupLexiconCommitMode = 'typing' | 'immediate';

export type SetupPlayableLexiconHintStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface UseSetupPlayableLexiconHintOptions {
  baseWordInput: string;
  allowProperNouns: boolean;
  allowSlang: boolean;
  /** `typing` debounces prefetch; `immediate` runs after select/shuffle. */
  commitMode: SetupLexiconCommitMode;
}

export interface UseSetupPlayableLexiconHintResult {
  status: SetupPlayableLexiconHintStatus;
  maxCount: number | null;
}

function mapPrefetchStatus(
  prefetch: RoundPlayableLexiconPrefetchStatus,
  wantKey: string | null,
): { status: SetupPlayableLexiconHintStatus; maxCount: number | null } {
  if (!wantKey) {
    return { status: 'empty', maxCount: null };
  }
  if (prefetch.kind === 'ready' && prefetch.key === wantKey) {
    return { status: 'ready', maxCount: prefetch.maxCount };
  }
  if (prefetch.kind === 'error' && prefetch.key === wantKey) {
    return { status: 'error', maxCount: null };
  }
  if (prefetch.kind === 'loading' && prefetch.key === wantKey) {
    return { status: 'loading', maxCount: null };
  }
  if (prefetch.kind === 'empty' || prefetch.kind === 'idle') {
    return { status: 'empty', maxCount: null };
  }
  return { status: 'loading', maxCount: null };
}

/**
 * Prefetch round lexicon on base-word setup screens (debounced for typing).
 */
export function useSetupPlayableLexiconHint({
  baseWordInput,
  allowProperNouns,
  allowSlang,
  commitMode,
}: UseSetupPlayableLexiconHintOptions): UseSetupPlayableLexiconHintResult {
  const [status, setStatus] = useState<SetupPlayableLexiconHintStatus>('empty');
  const [maxCount, setMaxCount] = useState<number | null>(null);
  const prevNormalizedRef = useRef(normalizeUk(baseWordInput));

  useEffect(() => {
    const normalized = normalizeUk(baseWordInput);
    if (!normalized) {
      prevNormalizedRef.current = '';
      clearRoundPlayableLexiconPrefetch();
      setStatus('empty');
      setMaxCount(null);
      return;
    }

    const wordChanged = prevNormalizedRef.current !== normalized;
    prevNormalizedRef.current = normalized;
    const delay = commitMode === 'typing' && wordChanged ? VALIDATION_DEBOUNCE_MS : 0;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) {
        return;
      }
      requestRoundPlayableLexiconPrefetch({
        baseWord: normalized,
        allowProperNouns,
        allowSlang,
      });
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [allowProperNouns, allowSlang, baseWordInput, commitMode]);

  useEffect(() => {
    const normalized = normalizeUk(baseWordInput);
    const wantKey = normalized ? lexiconCacheKey(normalized, allowProperNouns, allowSlang) : null;

    return subscribeRoundPlayableLexiconPrefetch((prefetch) => {
      const mapped = mapPrefetchStatus(prefetch, wantKey);
      setStatus(mapped.status);
      setMaxCount(mapped.maxCount);
    });
  }, [allowProperNouns, allowSlang, baseWordInput]);

  return { status, maxCount };
}
