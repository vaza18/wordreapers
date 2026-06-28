import { useWindowDimensions } from 'react-native';

import {
  scaledBaseWordSuggestMaxListHeight,
  scaledBaseWordSuggestMoreRowHeight,
  scaledBaseWordSuggestRowHeight,
} from '@/lib/game/base-word-suggest-layout';

/** Scaled geometry for the base-word autocomplete dropdown. */
export function useBaseWordSuggestLayout() {
  const { width, fontScale } = useWindowDimensions();

  return {
    rowHeight: scaledBaseWordSuggestRowHeight(fontScale, width),
    maxListHeight: scaledBaseWordSuggestMaxListHeight(fontScale, width),
    moreRowHeight: scaledBaseWordSuggestMoreRowHeight(fontScale, width),
  };
}
