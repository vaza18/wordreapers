import { describe, expect, it } from 'vitest';

import { DRAFT_DISPLAY_LETTER_SPACING } from '../constants/compose-draft.js';
import {
  draftFlyGlyphTopLeftFromLineLayout,
  draftFlyLineBoxTop,
} from '../lib/game/draft-fly-layout.js';

describe('draftFlyLineBoxTop', () => {
  it('aligns fly line box top when layout and fly line heights match', () => {
    expect(draftFlyLineBoxTop(100, 10, 48, 48)).toBe(110);
  });

  it('shifts fly line box up when the laid-out line is shorter than the ghost line height', () => {
    expect(draftFlyLineBoxTop(100, 10, 28, 48)).toBe(100);
  });
});

describe('draftFlyGlyphTopLeftFromLineLayout', () => {
  const draftTextOrigin = { x: 62, y: 24 };
  const containerLineHeight = 48;

  it('places the first glyph at the measured text origin plus centered line offset', () => {
    const { topLeft } = draftFlyGlyphTopLeftFromLineLayout({
      charIndex: 0,
      layout: {
        width: 120,
        capHeight: 18,
        charCount: 4,
        lineHeight: 44,
        lineTopOffset: 2,
        containerLineHeight,
        draftTextOrigin,
      },
      draftFontSize: 24,
    });

    expect(topLeft.x).toBe(62);
    expect(topLeft.y).toBe(24 + 2 + (44 - containerLineHeight) / 2);
  });

  it('subtracts letter spacing from equal-width estimate', () => {
    const { topLeft } = draftFlyGlyphTopLeftFromLineLayout({
      charIndex: 2,
      layout: {
        width: 80,
        capHeight: 14,
        charCount: 4,
        lineHeight: 28,
        lineTopOffset: 10,
        containerLineHeight,
        letterSpacing: DRAFT_DISPLAY_LETTER_SPACING,
        draftTextOrigin,
      },
      draftFontSize: 24,
    });

    expect(topLeft.x).toBeCloseTo(62 + 2 * (19.25 + 1), 5);
    expect(topLeft.y).toBe(24 + 10 + (28 - containerLineHeight) / 2);
  });

  it('uses proportional prefix width so later glyphs shift when the line shrinks', () => {
    const short = draftFlyGlyphTopLeftFromLineLayout({
      charIndex: 2,
      layout: {
        width: 80,
        capHeight: 14,
        charCount: 4,
        lineHeight: 28,
        lineTopOffset: 10,
        containerLineHeight,
        draftTextOrigin,
      },
      draftFontSize: 24,
    });
    const long = draftFlyGlyphTopLeftFromLineLayout({
      charIndex: 2,
      layout: {
        width: 120,
        capHeight: 18,
        charCount: 4,
        lineHeight: 44,
        lineTopOffset: 2,
        containerLineHeight,
        draftTextOrigin,
      },
      draftFontSize: 24,
    });

    expect(short.topLeft.x).toBeLessThan(long.topLeft.x);
    expect(short.endScale).toBeLessThan(1);
    expect(long.endScale).toBeLessThanOrEqual(1);
  });
});
