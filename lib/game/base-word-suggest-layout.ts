import { clampPlayableFontScale } from '@/lib/typography/font-scale';

/** Suggestion row height at the design font scale. */
export const BASE_WORD_SUGGEST_ROW_HEIGHT = 40;

/** Max scroll area height for suggestions at the design font scale (~5 rows). */
export const BASE_WORD_SUGGEST_MAX_LIST_HEIGHT = 200;

/** Footer row height for the “more matches” hint at the design font scale. */
export const BASE_WORD_SUGGEST_MORE_ROW_HEIGHT = 32;

function scaledValue(systemFontScale: number, screenWidth: number, base: number): number {
  const scale = clampPlayableFontScale(systemFontScale, screenWidth);
  return Math.round(base * scale);
}

/** Suggestion row height at capped OS font scale. */
export function scaledBaseWordSuggestRowHeight(
  systemFontScale: number,
  screenWidth: number,
): number {
  return scaledValue(systemFontScale, screenWidth, BASE_WORD_SUGGEST_ROW_HEIGHT);
}

/** Max scroll area height for suggestions at capped OS font scale. */
export function scaledBaseWordSuggestMaxListHeight(
  systemFontScale: number,
  screenWidth: number,
): number {
  return scaledValue(systemFontScale, screenWidth, BASE_WORD_SUGGEST_MAX_LIST_HEIGHT);
}

/** Footer row height for the “more matches” hint at capped OS font scale. */
export function scaledBaseWordSuggestMoreRowHeight(
  systemFontScale: number,
  screenWidth: number,
): number {
  return scaledValue(systemFontScale, screenWidth, BASE_WORD_SUGGEST_MORE_ROW_HEIGHT);
}
