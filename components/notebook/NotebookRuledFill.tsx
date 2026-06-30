import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NotebookLineFiller } from './NotebookLineFiller';
import { useNotebookRowHeight } from '@/hooks/useNotebookRowHeight';

interface NotebookRuledFillProps {
  height: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ruled notebook paper — empty rows with bottom lines (scrolls with parent content).
 */
export function NotebookRuledFill({ height, style }: NotebookRuledFillProps) {
  const rowHeight = useNotebookRowHeight();

  if (height <= 0) {
    return null;
  }

  const rowCount = Math.ceil(height / rowHeight);

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
} from './NotebookLineFiller';
export { createNotebookRowLineStyle } from '@/lib/notebook/row-line-style';
