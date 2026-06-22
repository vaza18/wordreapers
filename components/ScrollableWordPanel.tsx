import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NotebookHolesHeader } from '@/components/notebook/NotebookHolesHeader';
import { NotebookRuledFill } from '@/components/notebook/NotebookRuledFill';
import { NOTEBOOK_HOLES_HEADER_HEIGHT } from '@/constants/notebook';
import type { PanelScrollbarState, PanelScrollMetrics } from '@/hooks/useScrollablePanelMetrics';
import { colors, radii } from '@/constants/theme';

interface ScrollableWordPanelProps {
  children: ReactNode;
  scrollbar?: PanelScrollbarState;
  scrollMetrics?: PanelScrollMetrics;
  style?: StyleProp<ViewStyle>;
}

/**
 * Notebook-styled flex-growing frame for scrollable accepted-word lists.
 */
export function ScrollableWordPanel({
  children,
  scrollbar,
  scrollMetrics,
  style,
}: ScrollableWordPanelProps) {
  const ruledHeight = scrollMetrics
    ? Math.max(scrollMetrics.viewportHeight, scrollMetrics.contentHeight)
    : 0;

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.contentRow}>
        <View style={styles.body}>
          {scrollMetrics && ruledHeight > 0 ? (
            <NotebookRuledFill
              height={ruledHeight + scrollMetrics.scrollOffset}
              style={{
                position: 'absolute',
                top: NOTEBOOK_HOLES_HEADER_HEIGHT - scrollMetrics.scrollOffset,
                left: 0,
                right: 0,
                zIndex: 0,
              }}
            />
          ) : null}
          <View style={styles.scrollContent}>{children}</View>
        </View>
        {scrollbar?.visible ? (
          <View
            style={styles.scrollbarTrack}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <View
              style={[
                styles.scrollbarThumb,
                {
                  height: scrollbar.thumbHeight,
                  transform: [{ translateY: scrollbar.thumbOffset }],
                },
              ]}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.holesOverlay} pointerEvents="none">
        <NotebookHolesHeader />
      </View>
    </View>
  );
}

const SCROLLBAR_WIDTH = 8;

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 120,
    backgroundColor: colors.notebookPaper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderTertiary,
    borderRadius: radii.md,
    boxShadow: '2px 2px 2px 0px rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flex: 1,
    minHeight: 0,
    paddingTop: NOTEBOOK_HOLES_HEADER_HEIGHT,
    zIndex: 1,
  },
  holesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 3,
  },
  scrollbarTrack: {
    width: SCROLLBAR_WIDTH,
    marginVertical: 6,
    marginRight: 4,
    borderRadius: SCROLLBAR_WIDTH / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    overflow: 'hidden',
    zIndex: 1,
  },
  scrollbarThumb: {
    width: SCROLLBAR_WIDTH,
    borderRadius: SCROLLBAR_WIDTH / 2,
    backgroundColor: '#999999',
  },
});
