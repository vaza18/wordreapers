import { memo } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';

export interface DraftLetterFlyOverlayProps {
  flyLetter: string;
  flyPosition: Animated.ValueXY;
  flyScale: Animated.Value;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  style: StyleProp<TextStyle>;
}

/** Ghost letter during key-to-draft fly — isolated from draft text re-renders. */
export const DraftLetterFlyOverlay = memo(function DraftLetterFlyOverlay({
  flyLetter,
  flyPosition,
  flyScale,
  fontSize,
  lineHeight,
  letterSpacing,
  style,
}: DraftLetterFlyOverlayProps) {
  return (
    <Animated.Text
      pointerEvents="none"
      allowFontScaling={false}
      style={[
        style,
        {
          fontSize,
          lineHeight,
          height: lineHeight,
          letterSpacing,
          transformOrigin: 'left center',
          transform: [...flyPosition.getTranslateTransform(), { scale: flyScale }],
        },
      ]}
    >
      {flyLetter}
    </Animated.Text>
  );
});
