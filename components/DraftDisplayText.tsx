import { forwardRef, memo } from 'react';
import { Text, View, type StyleProp, type TextStyle } from 'react-native';

import { DRAFT_MIN_FONT_SCALE, DRAFT_REVEALING_CHAR_COLOR } from '@/constants/compose-draft';

export interface DraftDisplayTextProps {
  display: string;
  isCharRevealing: (index: number) => boolean;
  /** Bumps when per-character reveal state changes. */
  revealVersion: number;
  onTextLayout: (layout: {
    width: number;
    capHeight: number;
    lineHeight: number;
    lineTopOffset: number;
  }) => void;
  style: StyleProp<TextStyle>;
  fontSize: number;
  height: number;
}

/**
 * Draft string with optional per-glyph hide (Android-safe transparent color until fly completes).
 */
export const DraftDisplayText = memo(
  forwardRef<Text, DraftDisplayTextProps>(function DraftDisplayText(
    { display, isCharRevealing, revealVersion, onTextLayout, style, fontSize, height },
    ref,
  ) {
    void revealVersion;

    return (
      <View style={{ height, width: '100%', justifyContent: 'center' }}>
        <Text
          ref={ref}
          allowFontScaling={false}
          adjustsFontSizeToFit
          minimumFontScale={DRAFT_MIN_FONT_SCALE}
          numberOfLines={1}
          onTextLayout={(event) => {
            const line = event.nativeEvent.lines[0];
            const lineY = line?.y ?? 0;
            onTextLayout({
              width: line?.width ?? 0,
              capHeight: line?.capHeight ?? 0,
              lineHeight: line?.height ?? 0,
              lineTopOffset: lineY,
            });
          }}
          style={[style, { fontSize, width: '100%' }]}
        >
          {display.split('').map((character, index) => {
            if (isCharRevealing(index)) {
              return (
                <Text key={`draft-char-${index}`} style={{ color: DRAFT_REVEALING_CHAR_COLOR }}>
                  {character}
                </Text>
              );
            }
            return character;
          })}
        </Text>
      </View>
    );
  }),
);
