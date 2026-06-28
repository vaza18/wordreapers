import { describe, expect, it } from 'vitest';

import { playWordErrorMessage, playWordFeedbackVariant } from '@/lib/game/play-word-feedback';

const t = (key: string) => key;

describe('playWordErrorMessage', () => {
  it('maps TOO_SHORT and NOT_IN_DICTIONARY', () => {
    expect(playWordErrorMessage(t, 'TOO_SHORT')).toBe('game.errorTooShort');
    expect(playWordErrorMessage(t, 'NOT_IN_DICTIONARY')).toBe('game.errorNotInDictionary');
  });

  it('returns null for undefined code', () => {
    expect(playWordErrorMessage(t, undefined)).toBeNull();
  });
});

describe('playWordFeedbackVariant', () => {
  it('returns success when accepted', () => {
    expect(playWordFeedbackVariant(true)).toBe('success');
  });

  it('returns warning for dictionary and length errors', () => {
    expect(playWordFeedbackVariant(false, 'TOO_SHORT')).toBe('warning');
    expect(playWordFeedbackVariant(false, 'NOT_IN_DICTIONARY')).toBe('warning');
  });

  it('returns default for other errors', () => {
    expect(playWordFeedbackVariant(false, 'ALREADY_SUBMITTED')).toBe('default');
  });
});
