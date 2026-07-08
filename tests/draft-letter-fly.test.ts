import { describe, expect, it } from 'vitest';

import { draftLetterFlyEndpoints } from '../lib/game/draft-letter-fly.js';

describe('draftLetterFlyEndpoints', () => {
  it('starts centred on the key and lands at the left edge of the next draft glyph', () => {
    const draftFontSize = 20;
    const draftPaddingHorizontal = 12;
    const result = draftLetterFlyEndpoints({
      keyRect: { x: 100, y: 400, width: 40, height: 40 },
      panelOrigin: { x: 0, y: 0 },
      draftBox: { x: 50, y: 20, width: 200, height: 48 },
      measuredDraftWidth: 26,
      draftFontSize,
      draftPaddingHorizontal,
    });

    const halfX = draftFontSize * 0.3;
    const halfY = draftFontSize * 0.5;
    const contentLeft = 50 + draftPaddingHorizontal;

    expect(result.start).toEqual({
      x: 100 + 20 - halfX,
      y: 400 + 20 - halfY,
    });
    expect(result.end).toEqual({
      x: contentLeft + 26,
      y: 20 + 24 - halfY,
    });
  });

  it('lands at the padded content left when the draft is empty', () => {
    const result = draftLetterFlyEndpoints({
      keyRect: { x: 10, y: 100, width: 30, height: 30 },
      panelOrigin: { x: 0, y: 0 },
      draftBox: { x: 40, y: 10, width: 80, height: 40 },
      measuredDraftWidth: 0,
      draftFontSize: 18,
      draftPaddingHorizontal: 12,
    });

    expect(result.end.x).toBe(40 + 12);
  });

  it('clamps the landing x so the fly glyph stays inside the draft content box', () => {
    const draftFontSize = 18;
    const result = draftLetterFlyEndpoints({
      keyRect: { x: 10, y: 100, width: 30, height: 30 },
      panelOrigin: { x: 0, y: 0 },
      draftBox: { x: 40, y: 10, width: 80, height: 40 },
      measuredDraftWidth: 200,
      draftFontSize,
      draftPaddingHorizontal: 12,
    });

    const halfX = draftFontSize * 0.3;
    const contentRight = 40 + 80 - 12;
    // Keep roughly one glyph width inside the content edge.
    expect(result.end.x).toBe(contentRight - halfX * 2);
  });

  it('subtracts panel origin so endpoints are panel-local', () => {
    const result = draftLetterFlyEndpoints({
      keyRect: { x: 130, y: 450, width: 40, height: 40 },
      panelOrigin: { x: 30, y: 50 },
      draftBox: { x: 80, y: 70, width: 200, height: 48 },
      measuredDraftWidth: 0,
      draftFontSize: 20,
      draftPaddingHorizontal: 12,
    });

    expect(result.start).toEqual({ x: 114, y: 410 });
    expect(result.end).toEqual({ x: 62, y: 34 });
  });
});
