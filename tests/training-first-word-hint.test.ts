import { describe, expect, it } from 'vitest';

import { formatFirstWordHintLetters } from '@/lib/onboarding/training-first-word-hint';

describe('formatFirstWordHintLetters', () => {
  it('uppercases and spaces letters', () => {
    expect(formatFirstWordHintLetters('екю')).toBe('Е К Ю');
  });
});
