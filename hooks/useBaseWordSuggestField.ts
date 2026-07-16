import { useCallback, useEffect, useRef } from 'react';
import { Keyboard } from 'react-native';

import { MIN_BASE_WORD_LENGTH } from '@/constants/base-word';
import {
  BASE_WORD_SUGGEST_BLUR_MS,
  BASE_WORD_SUGGEST_IGNORE_CHANGE_MS,
} from '@/constants/base-word-suggest';
import type { SetupLexiconCommitMode } from '@/hooks/useSetupPlayableLexiconHint';
import { letterCount } from '@/lib/dictionary/normalize';

type UseBaseWordSuggestFieldParams = {
  baseWordInput: string;
  setBaseWordInput: (value: string) => void;
  setLexiconCommitMode: (mode: SetupLexiconCommitMode) => void;
  setBaseWordFocused: (focused: boolean) => void;
};

/**
 * Shared TextInput / suggest handlers for setup + pick-word.
 * Ignores stale iOS `onChangeText` after programmatic suggest/shuffle writes.
 */
export function useBaseWordSuggestField({
  baseWordInput,
  setBaseWordInput,
  setLexiconCommitMode,
  setBaseWordFocused,
}: UseBaseWordSuggestFieldParams) {
  const suppressSuggestBlurRef = useRef(false);
  const ignoreBaseWordChangeRef = useRef(false);
  const baseWordInputRef = useRef(baseWordInput);
  const ignoreChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressExpireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  baseWordInputRef.current = baseWordInput;

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const clearIgnoreChangeTimer = useCallback(() => {
    if (ignoreChangeTimerRef.current != null) {
      clearTimeout(ignoreChangeTimerRef.current);
      ignoreChangeTimerRef.current = null;
    }
  }, []);

  const clearSuppressExpireTimer = useCallback(() => {
    if (suppressExpireTimerRef.current != null) {
      clearTimeout(suppressExpireTimerRef.current);
      suppressExpireTimerRef.current = null;
    }
  }, []);

  const clearSuppress = useCallback(() => {
    suppressSuggestBlurRef.current = false;
    clearSuppressExpireTimer();
  }, [clearSuppressExpireTimer]);

  useEffect(() => {
    return () => {
      if (ignoreChangeTimerRef.current != null) {
        clearTimeout(ignoreChangeTimerRef.current);
      }
      if (blurTimerRef.current != null) {
        clearTimeout(blurTimerRef.current);
      }
      if (suppressExpireTimerRef.current != null) {
        clearTimeout(suppressExpireTimerRef.current);
      }
    };
  }, []);

  const onTouchSelectStart = useCallback(() => {
    suppressSuggestBlurRef.current = true;
    // TTL if press is cancelled without onPressOut / blur (belt-and-suspenders).
    clearSuppressExpireTimer();
    suppressExpireTimerRef.current = setTimeout(() => {
      suppressSuggestBlurRef.current = false;
      suppressExpireTimerRef.current = null;
    }, BASE_WORD_SUGGEST_BLUR_MS);
  }, [clearSuppressExpireTimer]);

  /** Call from suggestion `onPressOut`. Defers clear so `onPress`/commit can run first. */
  const onTouchSelectEnd = useCallback(() => {
    // RN order is pressOut → press. Clearing suppress synchronously would let a blur
    // between them start the dropdown-hide timer. Defer; commit clears sooner on success.
    setTimeout(() => {
      if (suppressSuggestBlurRef.current) {
        clearSuppress();
      }
    }, 0);
  }, [clearSuppress]);

  const commitBaseWordDisplay = useCallback(
    (display: string) => {
      // Blur from this gesture was already suppressed (or never scheduled). Do not leave
      // suppress=true — a later real blur would be swallowed and skip immediate prefetch.
      clearSuppress();
      clearBlurTimer();
      ignoreBaseWordChangeRef.current = true;
      setBaseWordInput(display);
      setLexiconCommitMode('immediate');
      setBaseWordFocused(false);
      Keyboard.dismiss();
      clearIgnoreChangeTimer();
      ignoreChangeTimerRef.current = setTimeout(() => {
        ignoreBaseWordChangeRef.current = false;
        ignoreChangeTimerRef.current = null;
      }, BASE_WORD_SUGGEST_IGNORE_CHANGE_MS);
    },
    [
      clearBlurTimer,
      clearIgnoreChangeTimer,
      clearSuppress,
      setBaseWordFocused,
      setBaseWordInput,
      setLexiconCommitMode,
    ],
  );

  const onChangeText = useCallback(
    (text: string) => {
      if (ignoreBaseWordChangeRef.current) {
        return;
      }
      setLexiconCommitMode('typing');
      setBaseWordInput(text);
    },
    [setBaseWordInput, setLexiconCommitMode],
  );

  const onFocus = useCallback(() => {
    clearSuppress();
    clearBlurTimer();
    ignoreBaseWordChangeRef.current = false;
    clearIgnoreChangeTimer();
    setBaseWordFocused(true);
  }, [clearBlurTimer, clearIgnoreChangeTimer, clearSuppress, setBaseWordFocused]);

  const onBlur = useCallback(() => {
    if (suppressSuggestBlurRef.current) {
      clearSuppress();
      // Still warm the cache — Start/Invite may unmount without another blur/press.
      if (letterCount(baseWordInputRef.current) >= MIN_BASE_WORD_LENGTH) {
        setLexiconCommitMode('immediate');
      }
      return;
    }
    // Commit lexicon immediately so unmount (Start / Invite) still warms the cache.
    // Only defer hiding the suggest dropdown.
    if (letterCount(baseWordInputRef.current) >= MIN_BASE_WORD_LENGTH) {
      setLexiconCommitMode('immediate');
    }
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      setBaseWordFocused(false);
    }, BASE_WORD_SUGGEST_BLUR_MS);
  }, [clearBlurTimer, clearSuppress, setBaseWordFocused, setLexiconCommitMode]);

  return {
    onChangeText,
    onFocus,
    onBlur,
    onTouchSelectStart,
    onTouchSelectEnd,
    commitBaseWordDisplay,
  };
}
