import { describe, expect, it } from 'vitest';

import {
  isPublicBaseWordSafe,
  isPublicBaseWordSafeFromDisplay,
} from '../lib/online/public-lobby/validate-public-base-word.js';

const BASE_WORDS = ['компютер', 'портрет', 'тестування'].sort();

describe('isPublicBaseWordSafe', () => {
  it('accepts words present in base_words list', () => {
    expect(isPublicBaseWordSafe('портрет', BASE_WORDS)).toBe(true);
  });

  it('rejects words missing from base_words list', () => {
    expect(isPublicBaseWordSafe('няшка', BASE_WORDS)).toBe(false);
    expect(isPublicBaseWordSafe('', BASE_WORDS)).toBe(false);
  });
});

describe('isPublicBaseWordSafeFromDisplay', () => {
  it('normalizes display form before lookup', () => {
    expect(isPublicBaseWordSafeFromDisplay('Портрет', BASE_WORDS)).toBe(true);
    expect(isPublicBaseWordSafeFromDisplay('НЯШКА', BASE_WORDS)).toBe(false);
  });
});
