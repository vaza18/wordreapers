import { describe, expect, it } from 'vitest';

import { DRAFT_FLY_DURATION_MS, DRAFT_REVEALING_CHAR_COLOR } from '../constants/compose-draft.js';

describe('draft letter reveal timing', () => {
  it('uses a single duration for fly move and draft handoff', () => {
    expect(DRAFT_FLY_DURATION_MS).toBeGreaterThan(0);
  });
});

describe('draft revealing glyph color', () => {
  /**
   * RN Android 0.81+ treats color integer 0 (`transparent` / `rgba(0,0,0,0)`) as
   * UndefinedColor and falls back to a visible color. Use #RRGGBBAA with non-zero RGB.
   * @see https://github.com/facebook/react-native/issues/53343
   */
  it('uses a non-zero #RRGGBBAA color so Android can hide glyphs during fly', () => {
    expect(DRAFT_REVEALING_CHAR_COLOR).not.toBe('transparent');
    expect(DRAFT_REVEALING_CHAR_COLOR.toLowerCase()).not.toBe('rgba(0,0,0,0)');
    expect(DRAFT_REVEALING_CHAR_COLOR).toMatch(/^#[0-9A-Fa-f]{8}$/);
    expect(DRAFT_REVEALING_CHAR_COLOR.slice(-2)).toBe('00');
    const rgb = Number.parseInt(DRAFT_REVEALING_CHAR_COLOR.slice(1, 7), 16);
    expect(rgb).toBeGreaterThan(0);
  });
});
