import { useEffect } from 'react';

import type { PlayWordFeedbackVariant } from '@/lib/game/play-word-feedback';

export const PLAY_WORD_FEEDBACK_DISMISS_MS = 2200;

/**
 * Auto-dismiss success feedback only; errors persist until draft changes.
 */
export function usePlayWordFeedbackDismiss(
  feedback: string | null,
  feedbackVariant: PlayWordFeedbackVariant,
  clearFeedback: () => void,
): void {
  useEffect(() => {
    if (!feedback || feedbackVariant !== 'success') {
      return;
    }
    const timer = setTimeout(() => {
      clearFeedback();
    }, PLAY_WORD_FEEDBACK_DISMISS_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [clearFeedback, feedback, feedbackVariant]);
}
