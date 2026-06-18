import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BUTTON_FEEDBACK,
  DEFAULT_WORD_ACCEPTED_FEEDBACK,
  parseFeedbackMode,
} from '../lib/settings/feedback-mode.js';

describe('parseFeedbackMode', () => {
  it('returns default for missing or invalid values', () => {
    expect(parseFeedbackMode(null, DEFAULT_BUTTON_FEEDBACK)).toBe('vibration');
    expect(parseFeedbackMode('invalid', DEFAULT_WORD_ACCEPTED_FEEDBACK)).toBe('sound');
  });

  it('accepts all feedback modes', () => {
    expect(parseFeedbackMode('both', DEFAULT_BUTTON_FEEDBACK)).toBe('both');
    expect(parseFeedbackMode('none', DEFAULT_WORD_ACCEPTED_FEEDBACK)).toBe('none');
  });
});
