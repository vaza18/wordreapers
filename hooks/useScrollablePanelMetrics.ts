import { useCallback, useMemo, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export interface PanelScrollbarState {
  visible: boolean;
  thumbHeight: number;
  thumbOffset: number;
}

export interface PanelScrollMetrics {
  viewportHeight: number;
  contentHeight: number;
  scrollOffset: number;
}

const MIN_THUMB_HEIGHT = 28;
const SCROLL_OVERFLOW_THRESHOLD = 4;

/**
 * Tracks scroll metrics for a flex-growing panel and derives a visible scrollbar thumb.
 */
export function useScrollablePanelMetrics() {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const scrollbar = useMemo((): PanelScrollbarState => {
    const maxScroll = Math.max(0, contentHeight - viewportHeight);
    const visible = viewportHeight > 0 && maxScroll > SCROLL_OVERFLOW_THRESHOLD;

    if (!visible) {
      return { visible: false, thumbHeight: 0, thumbOffset: 0 };
    }

    const thumbHeight = Math.max(
      MIN_THUMB_HEIGHT,
      (viewportHeight / contentHeight) * viewportHeight,
    );
    const travel = Math.max(0, viewportHeight - thumbHeight);
    const thumbOffset = maxScroll > 0 ? (scrollOffset / maxScroll) * travel : 0;

    return { visible: true, thumbHeight, thumbOffset };
  }, [contentHeight, scrollOffset, viewportHeight]);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    setContentHeight(height);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollOffset(event.nativeEvent.contentOffset.y);
  }, []);

  const scrollMetrics = useMemo(
    (): PanelScrollMetrics => ({
      viewportHeight,
      contentHeight,
      scrollOffset,
    }),
    [contentHeight, scrollOffset, viewportHeight],
  );

  return {
    scrollbar,
    scrollMetrics,
    onViewportLayout,
    onContentSizeChange,
    onScroll,
    scrollEventThrottle: 16 as const,
  };
}
