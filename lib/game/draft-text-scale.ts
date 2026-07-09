import { DRAFT_CAP_HEIGHT_RATIO, DRAFT_MIN_FONT_SCALE } from '@/constants/compose-draft';

/** Effective shrink factor from `adjustsFontSizeToFit` line metrics. */
export function draftEffectiveFontScale(
  capHeight: number,
  nominalFontSize: number,
  minimumScale = DRAFT_MIN_FONT_SCALE,
): number {
  if (nominalFontSize <= 0 || capHeight <= 0) {
    return 1;
  }
  const nominalCapHeight = nominalFontSize * DRAFT_CAP_HEIGHT_RATIO;
  const scale = capHeight / nominalCapHeight;
  return Math.min(1, Math.max(minimumScale, scale));
}

/** Fly ghost scale endpoints relative to nominal draft font size. */
export function draftFlyScaleEndpoints(
  keyLabelFontSize: number,
  nominalDraftFontSize: number,
  draftEffectiveScale: number,
): { startScale: number; endScale: number } {
  if (nominalDraftFontSize <= 0) {
    return { startScale: 1, endScale: 1 };
  }
  return {
    startScale: keyLabelFontSize / nominalDraftFontSize,
    endScale: draftEffectiveScale,
  };
}
