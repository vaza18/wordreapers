import { describe, expect, it } from 'vitest';

import { formatWordHintLetters } from '@/lib/onboarding/training-word-hint';

describe('formatWordHintLetters', () => {
  it('uppercases and spaces letters', () => {
    expect(formatWordHintLetters('екю')).toBe('Е К Ю');
  });
});
