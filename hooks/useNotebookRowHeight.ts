import { useWindowDimensions } from 'react-native';

import { scaledNotebookRowHeight } from '@/lib/notebook/row-height';

/** Notebook ruled-row height synced to Dynamic Type (capped). */
export function useNotebookRowHeight(): number {
  const { width, fontScale } = useWindowDimensions();
  return scaledNotebookRowHeight(fontScale, width);
}
