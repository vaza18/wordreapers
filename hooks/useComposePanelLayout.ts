import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  composeBackspaceGlyphSize,
  composeClearIconSize,
  composeDraftFontSize,
} from '@/lib/game/compose-panel-layout';

/** Scaled typography for the play-screen compose row. */
export function useComposePanelLayout(composeKeySize: number) {
  const { width, fontScale } = useWindowDimensions();

  return useMemo(
    () => ({
      draftFontSize: composeDraftFontSize(composeKeySize, fontScale, width),
      backspaceGlyphSize: composeBackspaceGlyphSize(composeKeySize, fontScale, width),
      clearIconSize: composeClearIconSize(composeKeySize),
    }),
    [composeKeySize, fontScale, width],
  );
}
