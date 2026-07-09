import { describe, expect, it } from 'vitest';

import {
  buildLetterKeys,
  computeLetterKeyGap,
  computeLetterKeyLayout,
  computeLetterKeySize,
  letterKeyboardRowWidth,
  LETTER_KEY_TABLET_SIZE,
  mmToLayoutDp,
} from '../lib/game/letter-keyboard.js';
import {
  LETTER_KEYBOARD_PHONE_COLUMNS,
  LETTER_KEY_TABLET_MIN_WIDTH,
} from '../constants/letter-keyboard.js';

describe('buildLetterKeys', () => {
  it('includes apostrophe in key value so draft input shows it', () => {
    const keys = buildLetterKeys("ДЕРЕВ'ЯНИСТІСТЬ");
    const apostropheKey = keys.find((key) => key.label === "'");
    expect(apostropheKey?.value).toBe("'");
  });
});

describe('mmToLayoutDp', () => {
  it('converts 15 mm to layout dp (~MacBook keycap)', () => {
    expect(mmToLayoutDp(15)).toBe(94);
  });
});

describe('computeLetterKeySize', () => {
  it('keeps 6-column phone sizing below tablet breakpoint', () => {
    expect(computeLetterKeySize(390)).toBe(56);
  });

  it('fits six keys per row on wider phones when gap scales with key size', () => {
    const { keySize, gap } = computeLetterKeyLayout(440);
    expect(keySize).toBe(63);
    expect(letterKeyboardRowWidth(keySize, gap, LETTER_KEYBOARD_PHONE_COLUMNS)).toBeLessThanOrEqual(
      440 - 32,
    );
  });

  it('uses ~15 mm keys on tablets so more keys fit per row via wrap', () => {
    expect(LETTER_KEY_TABLET_SIZE).toBe(mmToLayoutDp(15));
    expect(computeLetterKeySize(LETTER_KEY_TABLET_MIN_WIDTH)).toBe(LETTER_KEY_TABLET_SIZE);
    expect(computeLetterKeySize(1024)).toBe(LETTER_KEY_TABLET_SIZE);
  });
});

describe('computeLetterKeyGap', () => {
  it('scales gap with key size', () => {
    expect(computeLetterKeyGap(56)).toBe(4);
    expect(computeLetterKeyGap(LETTER_KEY_TABLET_SIZE)).toBe(7);
  });
});
