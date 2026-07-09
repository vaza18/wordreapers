import { describe, expect, it } from 'vitest';

import { DRAFT_CAP_HEIGHT_RATIO } from '../constants/compose-draft.js';
import { draftEffectiveFontScale, draftFlyScaleEndpoints } from '../lib/game/draft-text-scale.js';

describe('draftEffectiveFontScale', () => {
  it('returns 1 when cap height matches nominal size', () => {
    expect(draftEffectiveFontScale(20 * DRAFT_CAP_HEIGHT_RATIO, 20)).toBe(1);
  });

  it('returns shrunk scale for smaller cap height', () => {
    expect(draftEffectiveFontScale(7.1, 20)).toBe(0.5);
  });

  it('clamps to the draft minimum font scale', () => {
    expect(draftEffectiveFontScale(1, 20)).toBe(0.45);
  });
});

describe('draftFlyScaleEndpoints', () => {
  it('starts at key label size and ends at effective draft scale', () => {
    expect(draftFlyScaleEndpoints(28, 20, 0.5)).toEqual({
      startScale: 1.4,
      endScale: 0.5,
    });
  });
});
