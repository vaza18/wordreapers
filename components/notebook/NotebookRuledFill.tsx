import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { WORD_LIST_ROW_HEIGHT } from '@/constants/notebook';

import { NotebookLineFiller } from './NotebookLineFiller';

interface NotebookRuledFillProps {
  height: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ruled notebook paper — empty rows with bottom lines (scrolls with parent content).
 */
export function NotebookRuledFill({ height, style }: NotebookRuledFillProps) {
  if (height <= 0) {
    return null;
  }

  const rowCount = Math.ceil(height / WORD_LIST_ROW_HEIGHT);

  return (
    <View style={[styles.container, { height }, style]} pointerEvents="none">
      <NotebookLineFiller rowCount={rowCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export {
  notebookFillerRowCount,
  notebookListCanScroll,
  notebookListScrollHeight,
  notebookRowLineStyle,
} from './NotebookLineFiller';
export { notebookPaperHeight } from './notebookPaperHeight';
