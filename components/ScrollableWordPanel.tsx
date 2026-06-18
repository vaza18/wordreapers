import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { PanelScrollbarState } from '@/hooks/useScrollablePanelMetrics';
import { colors, radii } from '@/constants/theme';

interface ScrollableWordPanelProps {
  children: ReactNode;
  scrollbar?: PanelScrollbarState;
  style?: StyleProp<ViewStyle>;
}

/**
 * Visually distinct, flex-growing frame for scrollable accepted-word lists.
 */
export function ScrollableWordPanel({ children, scrollbar, style }: ScrollableWordPanelProps) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.contentRow}>
        <View style={styles.body}>{children}</View>
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
    </View>
  );
}

const SCROLLBAR_WIDTH = 8;

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minHeight: 120,
    backgroundColor: colors.backgroundPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.penBlue,
    borderTopWidth: 3,
    borderRadius: radii.md,
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
  scrollbarTrack: {
    width: SCROLLBAR_WIDTH,
    marginVertical: 6,
    marginRight: 4,
    borderRadius: SCROLLBAR_WIDTH / 2,
    backgroundColor: 'rgba(43, 108, 176, 0.12)',
    overflow: 'hidden',
  },
  scrollbarThumb: {
    width: SCROLLBAR_WIDTH,
    borderRadius: SCROLLBAR_WIDTH / 2,
    backgroundColor: colors.penBlue,
  },
});
