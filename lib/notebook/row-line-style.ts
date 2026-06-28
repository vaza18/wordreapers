import { StyleSheet } from 'react-native';

import { type ThemeColors } from '@/constants/theme';

/** Themed ruled-row styles (content and filler rows share scaled height). */
export function createNotebookRowLineStyle(colors: ThemeColors, rowHeight: number) {
  return StyleSheet.create({
    row: {
      height: rowHeight,
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.notebookLine,
      backgroundColor: colors.notebookPaper,
    },
    fillerRow: {
      height: rowHeight,
      borderBottomWidth: 1,
      borderBottomColor: colors.notebookLine,
      backgroundColor: colors.notebookPaper,
    },
  });
}
