import { describe, expect, it } from 'vitest';

import { MAX_PLAYABLE_FONT_SCALE_TABLET } from '../lib/typography/font-scale.js';
import {
  avatarGlyphInset,
  avatarInitialFillRatio,
  avatarInitialFontSize,
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

describe('avatarInitialFontSize', () => {
  it('derives glyph size from the design diameter', () => {
    expect(avatarInitialFontSize(40, 2)).toBe(22);
    expect(avatarInitialFontSize(40, 1)).toBe(24);
  });
});

describe('computeAvatarDisplay', () => {
  it('matches the design diameter at unit scale', () => {
    expect(computeAvatarDisplay(40, 1, 1, 390)).toEqual({ displaySize: 40, fontSize: 24 });
    expect(computeAvatarDisplay(40, 2, 1, 390)).toEqual({ displaySize: 38, fontSize: 22 });
  });

  it('scales glyphs and inset proportionally', () => {
    expect(computeAvatarDisplay(40, 1, 1.5, 800)).toEqual({ displaySize: 60, fontSize: 36 });

    const tabletScale = MAX_PLAYABLE_FONT_SCALE_TABLET;
    const inset = Math.round(avatarGlyphInset(40) * tabletScale);
    const twoLetterFont = Math.round(avatarInitialFontSize(40, 2) * tabletScale);
    const oneLetterFont = Math.round(avatarInitialFontSize(40, 1) * tabletScale);
    expect(computeAvatarDisplay(40, 2, 4, 800)).toEqual({
      displaySize: twoLetterFont + 2 * inset,
      fontSize: twoLetterFont,
    });
    expect(computeAvatarDisplay(40, 1, 4, 800)).toEqual({
      displaySize: oneLetterFont + 2 * inset,
      fontSize: oneLetterFont,
    });
  });
});
