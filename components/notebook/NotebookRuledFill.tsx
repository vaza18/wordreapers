import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { WORD_LIST_ROW_HEIGHT } from '@/constants/notebook';
import { colors } from '@/constants/theme';

interface NotebookRuledFillProps {
  height: number;
  lineInterval?: number;
  offsetTop?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Ruled notebook paper fill — horizontal lines at fixed interval.
 */
export function NotebookRuledFill({
  height,
  lineInterval = WORD_LIST_ROW_HEIGHT,
  offsetTop = 0,
  style,
}: NotebookRuledFillProps) {
  if (height <= 0) {
    return null;
  }

  const patternId = `notebookLines-${lineInterval}-${offsetTop}`;

  return (
    <View style={[styles.container, { height }, style]} pointerEvents="none">
      <Svg width="100%" height={height}>
        <Defs>
          <Pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width={1}
            height={lineInterval}
            y={offsetTop}
          >
            <Rect width={1} height={lineInterval} fill={colors.notebookPaper} />
            <Line
              x1={0}
              y1={lineInterval - 1}
              x2={10000}
              y2={lineInterval - 1}
              stroke={colors.notebookLine}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height={height} fill={colors.notebookPaper} />
        <Rect width="100%" height={height} fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
