import { useCallback } from 'react';

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

  return {
    rowHeight,
    getItemLayout,
    initialNumToRender: 24,
    maxToRenderPerBatch: 16,
    windowSize: 7,
    updateCellsBatchingPeriod: 50,
  };
}
