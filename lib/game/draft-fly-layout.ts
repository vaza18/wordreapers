import type { Point } from '@/lib/game/draft-letter-fly';
import { DRAFT_DISPLAY_LETTER_SPACING } from '@/constants/compose-draft';
import { draftEffectiveFontScale } from '@/lib/game/draft-text-scale';

/** Line metrics from the visible draft `Text` after shrink-to-fit. */
export type DraftLineLayout = {
  width: number;
  capHeight: number;
  charCount: number;
  lineHeight: number;
  /** Distance from draft `Text` top to laid-out line top (line.y). */
  lineTopOffset: number;
  /** Draft row height — matches fly ghost `lineHeight`. */
  containerLineHeight: number;
  letterSpacing?: number;
  /** Window top-left of the draft `Text` node (from `measureInWindow`). */
  draftTextOrigin: Point;
};

/** Inputs for estimating a fly landing point from draft line layout. */
export type DraftFlyGlyphLayoutInput = {
  charIndex: number;
  layout: DraftLineLayout;
  draftFontSize: number;
};

/** Window Y for the top of a fly ghost line box aligned to the draft line. */
export function draftFlyLineBoxTop(
  textOriginY: number,
  lineTopOffset: number,
  layoutLineHeight: number,
  flyLineHeight: number,
): number {
  return textOriginY + lineTopOffset + (layoutLineHeight - flyLineHeight) / 2;
}

/**
 * Top-left of a draft glyph line box in window coordinates.
 * Uses measured draft `Text` origin plus centered line offset.
 */
export function draftFlyGlyphTopLeftFromLineLayout({
  charIndex,
  layout,
  draftFontSize,
}: DraftFlyGlyphLayoutInput): { topLeft: Point; endScale: number } {
  const { width: lineWidth, capHeight, charCount, lineTopOffset, draftTextOrigin } = layout;
  const letterSpacing = layout.letterSpacing ?? DRAFT_DISPLAY_LETTER_SPACING;
  const endScale = draftEffectiveFontScale(capHeight, draftFontSize);
  const spacingTotal = charCount > 1 ? (charCount - 1) * letterSpacing : 0;
  const glyphsWidth = Math.max(0, lineWidth - spacingTotal);
  const charWidth = charCount > 0 ? glyphsWidth / charCount : 0;
  const glyphLeft = charIndex * (charWidth + letterSpacing);

  return {
    endScale,
    topLeft: {
      x: draftTextOrigin.x + glyphLeft,
      y: draftFlyLineBoxTop(
        draftTextOrigin.y,
        lineTopOffset,
        layout.lineHeight,
        layout.containerLineHeight,
      ),
    },
  };
}
