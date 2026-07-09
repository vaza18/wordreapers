import { describe, expect, it } from 'vitest';

import {
  draftLetterFlyEndPointFromTopLeft,
  draftLetterFlyStartPoint,
  isPendingDraftFlyValid,
} from '../lib/game/draft-letter-fly.js';

describe('draftLetterFlyStartPoint', () => {
  it('aligns ghost line box with key top and centres glyph horizontally', () => {
    const keyLabelFontSize = 28;
    const keyRect = { x: 100, y: 400, width: 40, height: 40 };
    const result = draftLetterFlyStartPoint(keyRect, { x: 0, y: 0 }, keyLabelFontSize);

    expect(result).toEqual({
      x: 100 + (40 - keyLabelFontSize * 0.6) / 2,
      y: 400,
    });
  });
});

describe('draftLetterFlyEndPointFromTopLeft', () => {
  it('maps draft line-box glyph origin into panel-local coords', () => {
    expect(draftLetterFlyEndPointFromTopLeft({ x: 80, y: 30 }, { x: 10, y: 5 })).toEqual({
      x: 70,
      y: 25,
    });
  });
});

describe('isPendingDraftFlyValid', () => {
  it('accepts a fly queued before React re-renders the longer draft', () => {
    expect(isPendingDraftFlyValid(2, 2)).toBe(true);
  });

  it('rejects a fly when backspace removed the target slot', () => {
    expect(isPendingDraftFlyValid(2, 1)).toBe(false);
  });
});
