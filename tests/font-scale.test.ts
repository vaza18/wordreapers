import { describe, expect, it } from 'vitest';

import {
  MAX_PLAYABLE_FONT_SCALE_PHONE,
  MAX_PLAYABLE_FONT_SCALE_TABLET,
  TABLET_LAYOUT_MIN_WIDTH,
  clampPlayableFontScale,
  getMaxPlayableFontScale,
  isTabletLayoutWidth,
  playableGlyphFontSize,
  playableLayoutSize,
} from '../lib/typography/font-scale.js';

describe('getMaxPlayableFontScale', () => {
  it('uses a higher cap on tablet-width layouts', () => {
    expect(getMaxPlayableFontScale(TABLET_LAYOUT_MIN_WIDTH)).toBe(MAX_PLAYABLE_FONT_SCALE_TABLET);
    expect(getMaxPlayableFontScale(1024)).toBe(MAX_PLAYABLE_FONT_SCALE_TABLET);
  });

  it('uses the phone cap below the tablet breakpoint', () => {
    expect(getMaxPlayableFontScale(390)).toBe(MAX_PLAYABLE_FONT_SCALE_PHONE);
  });
});

describe('isTabletLayoutWidth', () => {
  it('matches the shared layout breakpoint', () => {
    expect(isTabletLayoutWidth(TABLET_LAYOUT_MIN_WIDTH - 1)).toBe(false);
    expect(isTabletLayoutWidth(TABLET_LAYOUT_MIN_WIDTH)).toBe(true);
  });
});

describe('clampPlayableFontScale', () => {
  it('passes through scale at or below the phone cap', () => {
    expect(clampPlayableFontScale(1, 390)).toBe(1);
    expect(clampPlayableFontScale(1.15, 390)).toBe(1.15);
    expect(clampPlayableFontScale(MAX_PLAYABLE_FONT_SCALE_PHONE, 390)).toBe(
      MAX_PLAYABLE_FONT_SCALE_PHONE,
    );
  });

  it('passes through scale up to the tablet cap', () => {
    expect(clampPlayableFontScale(1.55, 1024)).toBe(1.55);
    expect(clampPlayableFontScale(MAX_PLAYABLE_FONT_SCALE_TABLET, 1024)).toBe(
      MAX_PLAYABLE_FONT_SCALE_TABLET,
    );
  });

  it('caps extreme accessibility scales per device class', () => {
    expect(clampPlayableFontScale(2, 390)).toBe(MAX_PLAYABLE_FONT_SCALE_PHONE);
    expect(clampPlayableFontScale(5, 1024)).toBe(MAX_PLAYABLE_FONT_SCALE_TABLET);
  });

  it('allows smaller than default', () => {
    expect(clampPlayableFontScale(0.85, 390)).toBe(0.85);
  });
});

describe('playableLayoutSize', () => {
  it('scales layout boxes with capped font scale', () => {
    expect(playableLayoutSize(40, 1, 390)).toBe(40);
    expect(playableLayoutSize(40, 2, 800)).toBe(80);
  });
});

describe('playableGlyphFontSize', () => {
  it('scales glyphs and caps fill inside a square', () => {
    expect(playableGlyphFontSize(28, 1, 390, 56)).toBe(28);
    expect(playableGlyphFontSize(28, 1.4, 390, 56)).toBe(39);
    expect(playableGlyphFontSize(28, 3, 800, 94)).toBe(68);
    expect(playableGlyphFontSize(47, 3, 800, 94)).toBe(68);
  });
});
