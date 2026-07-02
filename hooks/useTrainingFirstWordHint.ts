import { useEffect, useRef } from 'react';
import type { TFunction } from 'i18next';

import { formatFirstWordHintLetters } from '@/lib/onboarding/training-first-word-hint';

const FIRST_WORD_HINT_DELAY_MS = 20_000;

type UseTrainingFirstWordHintParams = {
  enabled: boolean;
  wordCount: number;
  draftLength: number;
  sortedWords: readonly string[] | undefined;
  displays: ReadonlyMap<string, string> | undefined;
  t: TFunction;
  onHint: (message: string) => void;
  onClearHint: () => void;
};

/**
 * After 20s with zero accepted words in training solo, suggest the first lexicon word.
 */
export function useTrainingFirstWordHint({
  enabled,
  wordCount,
  draftLength,
  sortedWords,
  displays,
  t,
  onHint,
  onClearHint,
}: UseTrainingFirstWordHintParams): void {
  const shownRef = useRef(false);

  useEffect(() => {
    // Only clear feedback the hint itself set — never stomp rejection/success chips.
    if (!enabled || wordCount > 0 || draftLength > 0) {
      if (shownRef.current) {
        shownRef.current = false;
        onClearHint();
      }
      return;
    }
    if (shownRef.current || !sortedWords?.length) {
      return;
    }
    const timer = setTimeout(() => {
      if (wordCount > 0 || draftLength > 0) {
        return;
      }
      const normalized = sortedWords[0];
      if (!normalized) {
        return;
      }
      const display = displays?.get(normalized) ?? normalized;
      const letters = formatFirstWordHintLetters(display);
      shownRef.current = true;
      onHint(t('training.firstWordHint', { letters }));
    }, FIRST_WORD_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [enabled, wordCount, draftLength, sortedWords, displays, t, onHint, onClearHint]);
}
