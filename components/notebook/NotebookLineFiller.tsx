import { View } from 'react-native';

import { NOTEBOOK_ROW_HEIGHT } from '@/constants/notebook';
import { useNotebookRowLineStyle } from '@/hooks/useNotebookRowLineStyle';

interface NotebookLineFillerProps {
  rowCount: number;
}

/** Empty ruled rows (e.g. unfilled viewport below the last word). */
export function NotebookLineFiller({ rowCount }: NotebookLineFillerProps) {
  const notebookRowLineStyle = useNotebookRowLineStyle();

  if (rowCount <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none">
      {Array.from({ length: rowCount }, (_, index) => (
        <View key={index} style={notebookRowLineStyle.fillerRow} />
      ))}
    </View>
  );
}

export function notebookListScrollHeight(
  rowCount: number,
  fillerRowCount: number,
  contentPaddingBottom = 0,
  rowHeight: number = NOTEBOOK_ROW_HEIGHT,
): number {
  return rowCount * rowHeight + fillerRowCount * rowHeight + contentPaddingBottom;
}

export function notebookListCanScroll(
  rowCount: number,
  viewportHeight: number,
  contentPaddingBottom = 0,
  rowHeight: number = NOTEBOOK_ROW_HEIGHT,
  threshold = 4,
): boolean {
  const fillerRowCount = notebookFillerRowCount(
    rowCount,
    viewportHeight,
    contentPaddingBottom,
    rowHeight,
  );
  const height = notebookListScrollHeight(
    rowCount,
    fillerRowCount,
    contentPaddingBottom,
    rowHeight,
  );
  return viewportHeight > 0 && height > viewportHeight + threshold;
}

export function notebookFillerRowCount(
  contentRowCount: number,
  viewportHeight: number,
  contentPaddingBottom = 0,
  rowHeight: number = NOTEBOOK_ROW_HEIGHT,
): number {
  if (viewportHeight <= 0) {
    return 0;
  }
  const contentHeight = contentRowCount * rowHeight;
  const remaining = viewportHeight - contentHeight - contentPaddingBottom;
  if (remaining < rowHeight) {
    return 0;
  }
  return Math.floor(remaining / rowHeight);
}
