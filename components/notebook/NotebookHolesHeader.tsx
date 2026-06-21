import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import {
  NOTEBOOK_HOLES_BAND_HEIGHT,
  NOTEBOOK_HOLES_END_GAP,
  NOTEBOOK_HOLES_PADDING_HORIZONTAL,
  NOTEBOOK_HOLES_PADDING_TOP,
  NOTEBOOK_HOLES_SHADOW_HEIGHT,
  NOTEBOOK_HOLES_STEP,
  NOTEBOOK_HOLE_DIAMETER,
} from '@/constants/notebook';
import { colors } from '@/constants/theme';

/**
 * Fixed top strip with repeating punch-hole pattern (View-based, no SVG).
 */
export function NotebookHolesHeader() {
  const [holeCount, setHoleCount] = useState(12);

  const onHolesRowLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0) {
      return;
    }
    const usableWidth = width - 2 * NOTEBOOK_HOLES_END_GAP;
    const holeCount = Math.max(1, Math.floor(usableWidth / NOTEBOOK_HOLES_STEP));
    setHoleCount(holeCount);
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.holesRow} onLayout={onHolesRowLayout}>
        {Array.from({ length: holeCount }, (_, index) => (
          <View key={index} style={styles.holeCell}>
            <View style={styles.hole} />
          </View>
        ))}
      </View>
      <View style={styles.shadowStrip} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.notebookPaper,
    paddingTop: NOTEBOOK_HOLES_PADDING_TOP,
    paddingHorizontal: NOTEBOOK_HOLES_PADDING_HORIZONTAL,
    paddingBottom: 0,
  },
  holesRow: {
    flexDirection: 'row',
    height: NOTEBOOK_HOLES_BAND_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeCell: {
    width: NOTEBOOK_HOLES_STEP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: {
    width: NOTEBOOK_HOLE_DIAMETER,
    height: NOTEBOOK_HOLE_DIAMETER,
    borderRadius: NOTEBOOK_HOLE_DIAMETER / 2,
    backgroundColor: colors.notebookHole,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.notebookHoleRing,
  },
  shadowStrip: {
    height: NOTEBOOK_HOLES_SHADOW_HEIGHT,
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
});
