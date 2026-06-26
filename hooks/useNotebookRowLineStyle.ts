import { useMemo } from 'react';

import { createNotebookRowLineStyle } from '@/components/notebook/NotebookLineFiller';
import { useTheme } from '@/hooks/useTheme';

import { useNotebookRowHeight } from './useNotebookRowHeight';

/** Themed ruled-row line style (content and filler rows share scaled height). */
export function useNotebookRowLineStyle() {
  const { colors } = useTheme();
  const rowHeight = useNotebookRowHeight();
  return useMemo(() => createNotebookRowLineStyle(colors, rowHeight), [colors, rowHeight]);
}
