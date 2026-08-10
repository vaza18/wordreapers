import { useEffect } from 'react';
import type { TFunction } from 'i18next';

import { formatWordHintLetters } from '@/lib/onboarding/training-word-hint';

const FIRST_WORD_HINT_DELAY_MS = 20_000;

type useTrainingWordHintParams = {
  enabled: boolean;
  enteredWords: readonly string[];
  draftLength: number;
  sortedWords: readonly string[] | undefined;
  displays: ReadonlyMap<string, string> | undefined;
  t: TFunction;
  onHint: (message: string) => void;
  onClearHint: () => void;
};

/**
 * After 20s silent period in training solo, suggest the random lexicon word.
 */
export function useTrainingWordHint({
  enabled,
  enteredWords,
  draftLength,
  sortedWords,
  displays,
  t,
  onHint,
  onClearHint,
}: useTrainingWordHintParams): void {
  useEffect(() => {
    const wordsLeft = sortedWords?.filter((word) => !enteredWords.includes(word));
    const randomWord = wordsLeft?.[Math.floor(Math.random() * wordsLeft.length)];
    const randomWordDisplay = displays?.get(randomWord ?? '');
    // Only clear feedback the hint itself set — never stomp rejection/success chips.
    if (!enabled || draftLength > 0) {
      onClearHint();
      return;
    }
    if (!sortedWords?.length) {
      return;
    }
    const timer = setTimeout(() => {
      if (draftLength > 0) {
        return;
      }
      const letters = formatWordHintLetters(randomWordDisplay ?? randomWord ?? '');
      onHint(
        letters.length > 0
          ? t('training.firstWordHint', { letters })
          : t('training.noWordsAnymore'),
      );
    }, FIRST_WORD_HINT_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [enabled, draftLength, sortedWords, displays, enteredWords, t, onHint, onClearHint]);
}
