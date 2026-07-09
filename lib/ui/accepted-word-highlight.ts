/** Peak opacity for the temporary accepted-word row background. */
export const ACCEPTED_WORD_HIGHLIGHT_PEAK = 1;

/** Solid highlight before fade when motion effects are enabled. */
export const ACCEPTED_WORD_HIGHLIGHT_HOLD_WITH_FADE_MS = 1000;

/** Fade-out duration after the hold when motion effects are enabled. */
export const ACCEPTED_WORD_HIGHLIGHT_FADE_MS = 500;

/** Solid highlight before sharp off when motion effects are disabled. */
export const ACCEPTED_WORD_HIGHLIGHT_HOLD_INSTANT_MS = 1500;

/** Hold/fade timing for the temporary accepted-word row background. */
export type AcceptedWordHighlightPlan = {
  holdMs: number;
  /** Null means the background turns off instantly after the hold. */
  fadeMs: number | null;
  peakOpacity: number;
};

/** Timing for the temporary accepted-word background highlight. */
export function planAcceptedWordHighlight(motionEnabled: boolean): AcceptedWordHighlightPlan {
  if (motionEnabled) {
    return {
      holdMs: ACCEPTED_WORD_HIGHLIGHT_HOLD_WITH_FADE_MS,
      fadeMs: ACCEPTED_WORD_HIGHLIGHT_FADE_MS,
      peakOpacity: ACCEPTED_WORD_HIGHLIGHT_PEAK,
    };
  }

  return {
    holdMs: ACCEPTED_WORD_HIGHLIGHT_HOLD_INSTANT_MS,
    fadeMs: null,
    peakOpacity: ACCEPTED_WORD_HIGHLIGHT_PEAK,
  };
}
