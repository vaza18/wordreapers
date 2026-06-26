import { describe, expect, it } from 'vitest';

import { NOTEBOOK_ROW_HEIGHT, WORD_LIST_ROW_HEIGHT } from '../constants/notebook.js';
import { scaledNotebookRowHeight } from '../lib/notebook/row-height.js';
import {
  MAX_PLAYABLE_FONT_SCALE_PHONE,
  MAX_PLAYABLE_FONT_SCALE_TABLET,
} from '../lib/typography/font-scale.js';

describe('NOTEBOOK_ROW_HEIGHT', () => {
  it('is ~20% tighter than the legacy mockup row height', () => {
    expect(NOTEBOOK_ROW_HEIGHT).toBe(Math.round(WORD_LIST_ROW_HEIGHT * 0.8));
  });
});

describe('scaledNotebookRowHeight', () => {
  it('returns the design row height at unit scale', () => {
    expect(scaledNotebookRowHeight(1, 390)).toBe(NOTEBOOK_ROW_HEIGHT);
  });

  it('scales row height with capped font scale', () => {
    expect(scaledNotebookRowHeight(2, 390)).toBe(
      Math.round(NOTEBOOK_ROW_HEIGHT * MAX_PLAYABLE_FONT_SCALE_PHONE),
    );
    expect(scaledNotebookRowHeight(3, 800)).toBe(
      Math.round(NOTEBOOK_ROW_HEIGHT * MAX_PLAYABLE_FONT_SCALE_TABLET),
    );
  });
});
