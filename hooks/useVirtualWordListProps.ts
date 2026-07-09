import { useCallback } from 'react';
import { Platform } from 'react-native';

import { useNotebookRowHeight } from '@/hooks/useNotebookRowHeight';

/** FlatList tuning for fixed-height notebook word rows (play + results). */
export function useVirtualWordListProps() {
  const rowHeight = useNotebookRowHeight();
  const getItemLayout = useCallback(
    (_data: unknown, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  const isAndroid = Platform.OS === 'android';

  return {
    rowHeight,
    getItemLayout,
    initialNumToRender: 24,
    maxToRenderPerBatch: isAndroid ? 10 : 16,
    windowSize: isAndroid ? 5 : 7,
    updateCellsBatchingPeriod: 50,
    removeClippedSubviews: isAndroid,
  };
}
