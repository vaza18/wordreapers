import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_WORD_HIGHLIGHT_FADE_MS,
  ACCEPTED_WORD_HIGHLIGHT_HOLD_INSTANT_MS,
  ACCEPTED_WORD_HIGHLIGHT_HOLD_WITH_FADE_MS,
  planAcceptedWordHighlight,
} from '../lib/ui/accepted-word-highlight.js';

describe('planAcceptedWordHighlight', () => {
  it('holds 1s then fades 0.5s when motion is enabled', () => {
    expect(planAcceptedWordHighlight(true)).toEqual({
      holdMs: ACCEPTED_WORD_HIGHLIGHT_HOLD_WITH_FADE_MS,
      fadeMs: ACCEPTED_WORD_HIGHLIGHT_FADE_MS,
      peakOpacity: 1,
    });
  });

  it('holds 1.5s then turns off instantly when motion is disabled', () => {
    expect(planAcceptedWordHighlight(false)).toEqual({
      holdMs: ACCEPTED_WORD_HIGHLIGHT_HOLD_INSTANT_MS,
      fadeMs: null,
      peakOpacity: 1,
    });
  });
});
