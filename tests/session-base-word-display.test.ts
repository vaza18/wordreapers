import { describe, expect, it } from 'vitest';

import { buildLetterKeys } from '../lib/game/letter-keyboard.js';
import { sessionBaseWordDisplay } from '../lib/online/session-base-word-display.js';

describe('sessionBaseWordDisplay', () => {
  it('prefers stored baseWordDisplay (with apostrophe)', () => {
    expect(
      sessionBaseWordDisplay({
        baseWord: 'віцепремєр-міністерка',
        baseWordDisplay: "ВІЦЕПРЕМ'ЄР-МІНІСТЕРКА",
      }),
    ).toBe("ВІЦЕПРЕМ'ЄР-МІНІСТЕРКА");
  });

  it('falls back to baseWord when display is missing', () => {
    expect(sessionBaseWordDisplay({ baseWord: 'портрет' })).toBe('ПОРТРЕТ');
  });
});

describe('online letter keyboard from session display field', () => {
  it('includes an apostrophe key from baseWordDisplay', () => {
    const display = sessionBaseWordDisplay({
      baseWord: 'віцепремєр-міністерка',
      baseWordDisplay: "віцепрем'єр-міністерка",
    });
    expect(buildLetterKeys(display).some((key) => key.label === "'")).toBe(true);
  });
});
