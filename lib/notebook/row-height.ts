import { NOTEBOOK_ROW_HEIGHT } from '@/constants/notebook';
import { clampPlayableFontScale } from '@/lib/typography/font-scale';

/** Ruled row height at the current capped OS font scale. */
export function scaledNotebookRowHeight(systemFontScale: number, screenWidth: number): number {
  const scale = clampPlayableFontScale(systemFontScale, screenWidth);
  return Math.round(NOTEBOOK_ROW_HEIGHT * scale);
}
