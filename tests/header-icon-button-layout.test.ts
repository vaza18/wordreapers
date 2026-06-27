import { describe, expect, it } from 'vitest';

import { MAX_PLAYABLE_FONT_SCALE_TABLET } from '../lib/typography/font-scale.js';
import {
  HEADER_ICON_BUTTON_SIZE,
  HEADER_ICON_SHUFFLE_GLYPH_SIZE,
  scaledHeaderIconButtonSize,
  scaledHeaderIconGlyphSize,
  scaledHeaderTextGlyphInButton,
} from '../lib/ui/header-icon-button-layout.js';

describe('scaledHeaderIconButtonSize', () => {
  it('matches the design size at unit scale', () => {
    expect(scaledHeaderIconButtonSize(1, 390)).toBe(HEADER_ICON_BUTTON_SIZE);
  });

  it('scales with capped OS font scale on tablets', () => {
    expect(scaledHeaderIconButtonSize(4, 800)).toBe(
      Math.round(HEADER_ICON_BUTTON_SIZE * MAX_PLAYABLE_FONT_SCALE_TABLET),
    );
  });
});

describe('scaledHeaderIconGlyphSize', () => {
  it('scales icon glyphs with capped OS font scale', () => {
    expect(scaledHeaderIconGlyphSize(22, 1, 390)).toBe(22);
    expect(scaledHeaderIconGlyphSize(22, 1.5, 800)).toBe(33);
  });
});

describe('scaledHeaderTextGlyphInButton', () => {
  it('caps text glyphs to the button interior', () => {
    const buttonSize = Math.round(HEADER_ICON_BUTTON_SIZE * MAX_PLAYABLE_FONT_SCALE_TABLET);
    expect(scaledHeaderTextGlyphInButton(HEADER_ICON_SHUFFLE_GLYPH_SIZE, 4, 800, buttonSize)).toBe(
      Math.round(HEADER_ICON_SHUFFLE_GLYPH_SIZE * MAX_PLAYABLE_FONT_SCALE_TABLET),
    );
  });
});
