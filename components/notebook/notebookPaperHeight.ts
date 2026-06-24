import { WORD_LIST_ROW_HEIGHT } from '@/constants/notebook';

export function notebookPaperHeight(rowCount: number, viewportHeight: number): number {
  const contentHeight = rowCount * WORD_LIST_ROW_HEIGHT;
  return viewportHeight > 0 ? Math.max(contentHeight, viewportHeight) : contentHeight;
}
