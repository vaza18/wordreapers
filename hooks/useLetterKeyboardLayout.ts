import { useCallback, useState } from 'react';
import { type LayoutChangeEvent, useWindowDimensions } from 'react-native';

import {
  computeLetterKeyLayout,
  LETTER_KEYBOARD_HORIZONTAL_PADDING,
} from '@/lib/game/letter-keyboard';

/**
 * Measure compose/keyboard width and derive square key geometry for six phone columns.
 */
export function useLetterKeyboardLayout() {
  const { width: screenWidth } = useWindowDimensions();
  const [measuredContentWidth, setMeasuredContentWidth] = useState<number | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0) {
      setMeasuredContentWidth(nextWidth);
    }
  }, []);

  const contentWidth =
    measuredContentWidth ?? Math.max(0, screenWidth - LETTER_KEYBOARD_HORIZONTAL_PADDING);
  const { keySize, gap } = computeLetterKeyLayout(contentWidth, { contentWidth: true });

  return { onLayout, keySize, gap, contentWidth };
}
