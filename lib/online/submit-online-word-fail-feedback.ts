import type { SubmitWordError } from '../firebase/submit-online-word.js';
import type { PlayWordFeedbackVariant } from '../game/play-word-feedback.js';

/** Feedback after optimistic accept when RTDB submit fails (rollback already applied). */
export function feedbackForFailedOnlineSubmit(
  t: (key: string) => string,
  error: SubmitWordError,
): { message: string; variant: PlayWordFeedbackVariant } {
  if (error === 'NETWORK') {
    return { message: t('online.errorFirebaseNetwork'), variant: 'default' };
  }
  // NOT_PLAYING / SESSION_MISSING / unexpected — do not leave «Слово зараховано».
  return { message: t('game.errorUnknown'), variant: 'default' };
}
