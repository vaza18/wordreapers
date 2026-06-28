import { describe, expect, it } from 'vitest';

import { MAX_PLAYABLE_FONT_SCALE_TABLET } from '../lib/typography/font-scale.js';
import {
  avatarGlyphInset,
  avatarInitialCharWidthEm,
  avatarInitialFillRatio,
  avatarInitialFontSize,
  avatarInitialsWidthEm,
  avatarTargetFontSize,
  computeAvatarDisplay,
} from '../lib/profile/scaled-avatar-size.js';

describe('avatarGlyphInset', () => {
  it('derives a fixed inset from the design diameter', () => {
    expect(avatarGlyphInset(40)).toBe(8);
    expect(avatarGlyphInset(28)).toBe(6);
  });
});

describe('avatarInitialFillRatio', () => {
  it('uses a smaller fill ratio for two-letter initials', () => {
    expect(avatarInitialFillRatio(1)).toBe(0.6);
    expect(avatarInitialFillRatio(2)).toBe(0.55);
  });
});

describe('avatarInitialsWidthEm', () => {
  it('sums narrow and wide glyph widths separately', () => {
    expect(avatarInitialsWidthEm('ВА')).toBeCloseTo(1.28);
    expect(avatarInitialsWidthEm('МШ')).toBeCloseTo(2.16);
    expect(avatarInitialsWidthEm('ЮЩ')).toBeCloseTo(2.06);
    expect(avatarInitialsWidthEm('Ю2')).toBeCloseTo(1.62);
  });

  it('classifies wide Cyrillic letters', () => {
    expect(avatarInitialCharWidthEm('Щ')).toBe(1.08);
    expect(avatarInitialCharWidthEm('Ю')).toBe(0.98);
    expect(avatarInitialCharWidthEm('А')).toBe(0.64);
  });
});

describe('avatarInitialFontSize', () => {
  it('keeps narrow pairs at the target size', () => {
    expect(avatarInitialFontSize(40, 'ВА')).toBe(22);
    expect(avatarInitialFontSize(56, 'ВА')).toBe(31);
  });

  it('caps mixed wide pairs below the target size', () => {
    expect(avatarInitialFontSize(56, 'ЮМ')).toBe(26);
  });

  it('caps wide pairs to fit the circle width', () => {
    expect(avatarInitialFontSize(40, 'МШ')).toBe(17);
    expect(avatarInitialFontSize(56, 'МШ')).toBe(25);
    expect(avatarInitialFontSize(56, 'ЮЩ')).toBe(26);
  });

  it('derives single-letter glyph size from the design diameter', () => {
    expect(avatarInitialFontSize(40, 'В')).toBe(24);
  });
});

describe('computeAvatarDisplay', () => {
  it('keeps the design diameter at unit scale', () => {
    expect(computeAvatarDisplay(40, 'В', 1, 390)).toEqual({ displaySize: 40, fontSize: 24 });
    expect(computeAvatarDisplay(40, 'ВА', 1, 390)).toEqual({ displaySize: 40, fontSize: 22 });
    expect(computeAvatarDisplay(40, 'МШ', 1, 390)).toEqual({ displaySize: 40, fontSize: 17 });
    expect(computeAvatarDisplay(56, 'МШ', 1, 390)).toEqual({ displaySize: 56, fontSize: 25 });
    expect(computeAvatarDisplay(56, 'ЮЩ', 1, 390)).toEqual({ displaySize: 56, fontSize: 26 });
    expect(computeAvatarDisplay(56, 'Ю2', 1, 390)).toEqual({ displaySize: 56, fontSize: 31 });
  });

  it('scales glyphs and circle proportionally', () => {
    expect(computeAvatarDisplay(40, 'В', 1.5, 800)).toEqual({ displaySize: 60, fontSize: 36 });

    const tabletScale = MAX_PLAYABLE_FONT_SCALE_TABLET;
    const inset = Math.round(avatarGlyphInset(40) * tabletScale);
    const twoLetterFont = avatarInitialFontSize(40, 'ВА', tabletScale);
    const oneLetterFont = avatarInitialFontSize(40, 'В', tabletScale);
    expect(computeAvatarDisplay(40, 'ВА', 4, 800)).toEqual({
      displaySize: Math.round(40 * tabletScale),
      fontSize: twoLetterFont,
    });
    expect(computeAvatarDisplay(40, 'В', 4, 800)).toEqual({
      displaySize: Math.round(40 * tabletScale),
      fontSize: oneLetterFont,
    });
    expect(twoLetterFont).toBeLessThanOrEqual(Math.round(40 * tabletScale) - 2 * inset);
  });

  it('exposes the uncapped target size separately', () => {
    expect(avatarTargetFontSize(56, 2)).toBe(31);
  });
});
