import { NOTEBOOK_ROW_HEIGHT } from '@/constants/notebook';

export function notebookPaperHeight(
  rowCount: number,
  viewportHeight: number,
  rowHeight: number = NOTEBOOK_ROW_HEIGHT,
): number {
  const contentHeight = rowCount * rowHeight;
  return viewportHeight > 0 ? Math.max(contentHeight, viewportHeight) : contentHeight;
}
