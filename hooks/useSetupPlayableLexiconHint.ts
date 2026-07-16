import { useEffect, useRef, useState } from 'react';

import { MIN_BASE_WORD_LENGTH } from '@/constants/base-word';
import { lexiconCacheKey } from '@/lib/dictionary/round-playable-lexicon';
import { letterCount, normalizeUk } from '@/lib/dictionary/normalize';
import {
  clearRoundPlayableLexiconPrefetch,
  pauseRoundPlayableLexiconPrefetch,
  requestRoundPlayableLexiconPrefetch,
  subscribeRoundPlayableLexiconPrefetch,
  type RoundPlayableLexiconPrefetchStatus,
} from '@/lib/dictionary/round-playable-lexicon-prefetch';

export type SetupLexiconCommitMode = 'typing' | 'immediate';

export type SetupPlayableLexiconHintStatus =
  'empty' | 'tooShort' | 'pending' | 'loading' | 'ready' | 'error';

export interface UseSetupPlayableLexiconHintOptions {
  baseWordInput: string;
  allowProperNouns: boolean;
  allowSlang: boolean;
  /**
   * `typing` does not start a lexicon build (avoids JS-thread contention with the keyboard).
   * `immediate` runs after select / shuffle / blur commit / hydrate.
   */
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
 * Prefetch round lexicon on base-word setup screens after an explicit commit.
 * Skips words shorter than {@link MIN_BASE_WORD_LENGTH}. Typing alone does not build.
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

    if (letterCount(normalized) < MIN_BASE_WORD_LENGTH) {
      prevNormalizedRef.current = normalized;
      clearRoundPlayableLexiconPrefetch();
      setStatus('tooShort');
      setMaxCount(null);
      return;
    }

    const wordChanged = prevNormalizedRef.current !== normalized;
    prevNormalizedRef.current = normalized;

    // Typing with an open keyboard contends with cooperative yields on Android — wait for commit.
    // Use `pending` (not `empty`) so the hint does not lie with «Обери базове слово».
    // Soft-pause only: do not evict cache (a typo must not force a full rebuild).
    if (commitMode !== 'immediate') {
      if (wordChanged) {
        pauseRoundPlayableLexiconPrefetch();
      }
      setStatus('pending');
      setMaxCount(null);
      return;
    }

    requestRoundPlayableLexiconPrefetch({
      baseWord: normalized,
      allowProperNouns,
      allowSlang,
    });
  }, [allowProperNouns, allowSlang, baseWordInput, commitMode]);

  useEffect(() => {
    const normalized = normalizeUk(baseWordInput);
    if (!normalized || letterCount(normalized) < MIN_BASE_WORD_LENGTH) {
      return;
    }
    if (commitMode !== 'immediate') {
      return;
    }
    const wantKey = lexiconCacheKey(normalized, allowProperNouns, allowSlang);

    return subscribeRoundPlayableLexiconPrefetch((prefetch) => {
      const mapped = mapPrefetchStatus(prefetch, wantKey);
      setStatus(mapped.status);
      setMaxCount(mapped.maxCount);
    });
  }, [allowProperNouns, allowSlang, baseWordInput, commitMode]);

  return { status, maxCount };
}
