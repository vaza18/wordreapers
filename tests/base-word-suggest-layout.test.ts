import { describe, expect, it } from 'vitest';

import {
  BASE_WORD_SUGGEST_MAX_LIST_HEIGHT,
  BASE_WORD_SUGGEST_MORE_ROW_HEIGHT,
  BASE_WORD_SUGGEST_ROW_HEIGHT,
} from '../constants/base-word-suggest.js';
import {
  scaledBaseWordSuggestMaxListHeight,
  scaledBaseWordSuggestMoreRowHeight,
  scaledBaseWordSuggestRowHeight,
} from '../lib/game/base-word-suggest-layout.js';
import { MAX_PLAYABLE_FONT_SCALE_TABLET } from '../lib/typography/font-scale.js';

describe('scaledBaseWordSuggestRowHeight', () => {
  it('returns the design row height at unit scale', () => {
    expect(scaledBaseWordSuggestRowHeight(1, 390)).toBe(BASE_WORD_SUGGEST_ROW_HEIGHT);
  });

  it('scales row height with capped font scale', () => {
    expect(scaledBaseWordSuggestRowHeight(4, 800)).toBe(
      Math.round(BASE_WORD_SUGGEST_ROW_HEIGHT * MAX_PLAYABLE_FONT_SCALE_TABLET),
    );
  });
});

describe('scaledBaseWordSuggestMaxListHeight', () => {
  it('scales the max scroll height with capped font scale', () => {
    expect(scaledBaseWordSuggestMaxListHeight(1, 390)).toBe(BASE_WORD_SUGGEST_MAX_LIST_HEIGHT);
    expect(scaledBaseWordSuggestMaxListHeight(2, 800)).toBe(BASE_WORD_SUGGEST_MAX_LIST_HEIGHT * 2);
  });
});

describe('scaledBaseWordSuggestMoreRowHeight', () => {
  it('scales the footer row with capped font scale', () => {
    expect(scaledBaseWordSuggestMoreRowHeight(1.5, 800)).toBe(
      Math.round(BASE_WORD_SUGGEST_MORE_ROW_HEIGHT * 1.5),
    );
  });
});
