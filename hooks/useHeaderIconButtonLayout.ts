import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import {
  HEADER_ICON_BACK_GLYPH_SIZE,
  HEADER_ICON_INFO_GLYPH_SIZE,
  HEADER_ICON_REFRESH_GLYPH_SIZE,
  HEADER_ICON_SETTINGS_GLYPH_SIZE,
  HEADER_ICON_SHUFFLE_GLYPH_SIZE,
  scaledHeaderIconButtonSize,
  scaledHeaderIconGlyphSize,
  scaledHeaderTextGlyphInButton,
} from '@/lib/ui/header-icon-button-layout';

/** Scaled header icon button + common glyph sizes for the current layout. */
export function useHeaderIconButtonLayout() {
  const { width, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const buttonSize = scaledHeaderIconButtonSize(fontScale, width);
    const glyph = (designSize: number) => scaledHeaderIconGlyphSize(designSize, fontScale, width);

    return {
      buttonSize,
      backIconSize: glyph(HEADER_ICON_BACK_GLYPH_SIZE),
      settingsIconSize: glyph(HEADER_ICON_SETTINGS_GLYPH_SIZE),
      infoIconSize: glyph(HEADER_ICON_INFO_GLYPH_SIZE),
      refreshIconSize: glyph(HEADER_ICON_REFRESH_GLYPH_SIZE),
      shuffleIconSize: scaledHeaderTextGlyphInButton(
        HEADER_ICON_SHUFFLE_GLYPH_SIZE,
        fontScale,
        width,
        buttonSize,
      ),
    };
  }, [fontScale, width]);
}
