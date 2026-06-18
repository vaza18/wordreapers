/** Key / word feedback options (app settings; OS keyboard prefs are not readable in Expo). */
export type FeedbackMode = 'none' | 'vibration' | 'sound' | 'both';

export const FEEDBACK_MODES: readonly FeedbackMode[] = [
  'none',
  'vibration',
  'sound',
  'both',
] as const;

export const DEFAULT_BUTTON_FEEDBACK: FeedbackMode = 'vibration';
/** @deprecated Use {@link DEFAULT_BUTTON_FEEDBACK}. */
export const DEFAULT_KEY_PRESS_FEEDBACK = DEFAULT_BUTTON_FEEDBACK;
export const DEFAULT_WORD_ACCEPTED_FEEDBACK: FeedbackMode = 'sound';
export const DEFAULT_TIMER_ALERT_FEEDBACK: FeedbackMode = 'sound';

/**
 * Parse persisted feedback mode; falls back to default when invalid.
 */
export function parseFeedbackMode(
  value: string | null | undefined,
  fallback: FeedbackMode,
): FeedbackMode {
  if (value && FEEDBACK_MODES.includes(value as FeedbackMode)) {
    return value as FeedbackMode;
  }
  return fallback;
}
