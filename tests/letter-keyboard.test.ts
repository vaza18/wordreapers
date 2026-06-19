import { describe, expect, it } from 'vitest';

import {
  buildLetterKeys,
  computeLetterKeySize,
  LETTER_KEY_MAX_SIZE,
  LETTER_KEY_TABLET_MIN_WIDTH,
} from '../lib/game/letter-keyboard.js';

describe('buildLetterKeys', () => {
  it('includes apostrophe in key value so draft input shows it', () => {
    const keys = buildLetterKeys("ДЕРЕВ'ЯНИСТІСТЬ");
    const apostropheKey = keys.find((key) => key.label === "'");
    expect(apostropheKey?.value).toBe("'");
  });
});

describe('computeLetterKeySize', () => {
  it('keeps 6-column phone sizing below tablet breakpoint', () => {
    expect(computeLetterKeySize(390)).toBe(56);
  });

  it('caps key size on wide screens so more keys fit per row', () => {
    expect(computeLetterKeySize(LETTER_KEY_TABLET_MIN_WIDTH)).toBe(LETTER_KEY_MAX_SIZE);
    expect(computeLetterKeySize(1024)).toBe(LETTER_KEY_MAX_SIZE);
  });
});
