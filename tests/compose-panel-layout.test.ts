import { describe, expect, it } from 'vitest';

import { COMPOSE_BACKSPACE_GLYPH_CAP, COMPOSE_DRAFT_MAX_FILL } from '../constants/compose-draft.js';
import {
  composeBackspaceGlyphSize,
  composeClearIconSize,
  composeDraftFontSize,
} from '../lib/game/compose-panel-layout.js';
import { computeLetterKeySize } from '../lib/game/letter-keyboard.js';

describe('composeDraftFontSize', () => {
  it('caps draft text to the compose key height', () => {
    const keySize = computeLetterKeySize(800);
    expect(composeDraftFontSize(keySize, 1, 800)).toBeLessThanOrEqual(
      Math.round(keySize * COMPOSE_DRAFT_MAX_FILL),
    );
  });
});

describe('composeBackspaceGlyphSize', () => {
  it('caps the backspace glyph to the key square', () => {
    const keySize = computeLetterKeySize(800);
    expect(composeBackspaceGlyphSize(keySize, 4, 800)).toBeLessThanOrEqual(
      Math.round(keySize * COMPOSE_BACKSPACE_GLYPH_CAP),
    );
  });

  it('does not shrink below the clear-draft icon size', () => {
    const keySize = computeLetterKeySize(390);
    expect(composeBackspaceGlyphSize(keySize, 0.85, 390)).toBe(composeClearIconSize(keySize));
  });
});

describe('composeClearIconSize', () => {
  it('derives SVG size from the key square', () => {
    expect(composeClearIconSize(94)).toBe(43);
  });
});
