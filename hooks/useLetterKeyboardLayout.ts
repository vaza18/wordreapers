import { useCallback, useState } from 'react';
import { type LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  computeLetterKeyLayout,
  LETTER_KEYBOARD_HORIZONTAL_PADDING,
} from '@/lib/game/letter-keyboard';

/** Reuse last measured compose width so keyboard geometry is stable on screen mount. */
let lastMeasuredKeyboardContentWidth: number | null = null;

/**
 * Measure compose/keyboard width and derive square key geometry for six phone columns.
 */
export function useLetterKeyboardLayout() {
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [measuredContentWidth, setMeasuredContentWidth] = useState<number | null>(
    () => lastMeasuredKeyboardContentWidth,
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth <= 0) {
      return;
    }
    lastMeasuredKeyboardContentWidth = nextWidth;
    setMeasuredContentWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const fallbackWidth = Math.max(
    0,
    screenWidth - insets.left - insets.right - LETTER_KEYBOARD_HORIZONTAL_PADDING,
  );
  const contentWidth = measuredContentWidth ?? fallbackWidth;
  const { keySize, gap } = computeLetterKeyLayout(contentWidth, { contentWidth: true });

  return { onLayout, keySize, gap, contentWidth };
}
