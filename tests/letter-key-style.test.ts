import { describe, expect, it } from 'vitest';

import {
  letterKeyProportions,
  tileInsetForCell,
  tileSizeForCell,
} from '../lib/game/letter-key-style.js';

describe('letterKeyProportions', () => {
  it('matches LetterKeyboard gap and radius ratios at reference width', () => {
    const props = letterKeyProportions();
    expect(props.keySize).toBe(56);
    expect(props.gap).toBe(4);
    expect(props.borderRadius).toBe(8);
    expect(props.fontSize).toBe(22);
    expect(props.gapRatio).toBeCloseTo(4 / 56);
    expect(props.borderRadiusRatio).toBeCloseTo(8 / 56);
    expect(props.fontSizeRatio).toBeCloseTo(22 / 56);
  });
});

describe('tileInsetForCell', () => {
  it('yields inter-tile gap equal to gameplay gap ratio', () => {
    const props = letterKeyProportions();
    const cellSize = 215;
    const inset = tileInsetForCell(cellSize, props);
    const tile = tileSizeForCell(cellSize, inset);
    expect((2 * inset) / tile).toBeCloseTo(props.gapRatio);
  });
});
