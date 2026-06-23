import { StyleSheet, View } from 'react-native';

import { WORD_LIST_ROW_HEIGHT } from '@/constants/notebook';
import { type ThemeColors } from '@/constants/theme';
import { useThemedStyles } from '@/hooks/useThemedStyles';

/** One ruled notebook row — height and bottom line stay in sync. */
export function createNotebookRowLineStyle(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      height: WORD_LIST_ROW_HEIGHT,
      borderBottomWidth: 1,
      borderBottomColor: colors.notebookLine,
      backgroundColor: colors.notebookPaper,
    },
  });
}

interface NotebookLineFillerProps {
  rowCount: number;
}

/** Empty ruled rows (e.g. unfilled viewport below the last word). */
export function NotebookLineFiller({ rowCount }: NotebookLineFillerProps) {
  const notebookRowLineStyle = useThemedStyles(createNotebookRowLineStyle);

  if (rowCount <= 0) {
    return null;
  }

  return (
    <View pointerEvents="none">
      {Array.from({ length: rowCount }, (_, index) => (
        <View key={index} style={notebookRowLineStyle.row} />
      ))}
    </View>
  );
}

export function notebookListScrollHeight(
  rowCount: number,
  fillerRowCount: number,
  contentPaddingBottom = 0,
): number {
  return (
    rowCount * WORD_LIST_ROW_HEIGHT + fillerRowCount * WORD_LIST_ROW_HEIGHT + contentPaddingBottom
  );
}

export function notebookListCanScroll(
  rowCount: number,
  viewportHeight: number,
  contentPaddingBottom = 0,
  threshold = 4,
): boolean {
  const fillerRowCount = notebookFillerRowCount(rowCount, viewportHeight, contentPaddingBottom);
  const height = notebookListScrollHeight(rowCount, fillerRowCount, contentPaddingBottom);
  return viewportHeight > 0 && height > viewportHeight + threshold;
}

export function notebookFillerRowCount(
  contentRowCount: number,
  viewportHeight: number,
  contentPaddingBottom = 0,
): number {
  if (viewportHeight <= 0) {
    return 0;
  }
  const contentHeight = contentRowCount * WORD_LIST_ROW_HEIGHT;
  const remaining = viewportHeight - contentHeight - contentPaddingBottom;
  if (remaining < WORD_LIST_ROW_HEIGHT) {
    return 0;
  }
  return Math.floor(remaining / WORD_LIST_ROW_HEIGHT);
}
